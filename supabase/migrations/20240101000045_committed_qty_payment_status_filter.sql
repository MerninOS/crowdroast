-- Tighten update_lot_committed_quantity to only count commits where the
-- buyer has actually saved a card (payment_status='setup_complete') or
-- already been charged (payment_status='charge_succeeded').
--
-- Before this change, the trigger summed every commit where status<>cancelled
-- — including 'pending_setup' rows where the buyer abandoned the Stripe
-- redirect and never saved a card. Those abandoned rows inflated
-- lots.committed_quantity_kg, drove the bag-progress UI off-by-N, and meant
-- the visible-commits list on the buyer page (which already filtered on
-- payment_status) drifted from the lot's aggregate.
--
-- After this change, "committed" in lots.committed_quantity_kg means
-- "buyer has a saved card we can charge at close" — the same definition the
-- buyer page, settle-deadlines cron, and bag-assignment logic already use.
--
-- Per the campaign-active rule from migration #26 (commits only count
-- toward the lot when they belong to an active campaign or have no campaign
-- at all — legacy data), that filter stays in place. Status-guard from
-- migration #24 (skip recompute on non-flippable lots) also unchanged.

create or replace function public.update_lot_committed_quantity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot_id uuid;
  v_status text;
  v_total numeric;
  v_sum numeric;
begin
  v_lot_id := coalesce(new.lot_id, old.lot_id);

  select status, total_quantity_kg
    into v_status, v_total
  from public.lots
  where id = v_lot_id;

  -- Skip the entire recompute on non-flippable lots. recycle_lot owns the
  -- canonical committed_quantity_kg=0 write for those states.
  if v_status not in ('active', 'fully_committed') then
    return coalesce(new, old);
  end if;

  select coalesce(sum(cm.quantity_kg), 0)
    into v_sum
  from public.commitments cm
  where cm.lot_id = v_lot_id
    and cm.status <> 'cancelled'
    and cm.payment_status in ('setup_complete', 'charge_succeeded')
    and (
      cm.campaign_id is null
      or exists (
        select 1
        from public.campaigns c
        where c.id = cm.campaign_id
          and c.status = 'active'
      )
    );

  update public.lots
  set committed_quantity_kg = v_sum,
      status = case when v_sum >= v_total then 'fully_committed' else 'active' end,
      updated_at = now()
  where id = v_lot_id;

  return coalesce(new, old);
end;
$$;

-- One-time cleanup: cancel orphan commits that never finished the Stripe
-- setup. The buyer page form previously dropped `setup_client_secret` on
-- the floor and never redirected to Stripe, so every bag-aware commit
-- left a `pending_setup` row sitting in the DB. With the form fixed, new
-- commits redirect properly; this clears the rows from before the fix.
--
-- Criteria: pending_setup, no payment method ever attached, older than
-- one hour. The age guard avoids racing a buyer who's currently in the
-- middle of completing Stripe.
update public.commitments
set status = 'cancelled',
    payment_status = 'cancelled',
    updated_at = now()
where payment_status = 'pending_setup'
  and stripe_payment_method_id is null
  and status <> 'cancelled'
  and created_at < now() - interval '1 hour';

-- Backfill: any currently-flippable lot whose committed_quantity_kg was
-- previously inflated by pending_setup or charge_failed rows gets
-- recomputed under the new rule.
update public.lots l
set committed_quantity_kg = sub.v_sum,
    status = case when sub.v_sum >= l.total_quantity_kg then 'fully_committed' else 'active' end,
    updated_at = now()
from (
  select
    l2.id as lot_id,
    coalesce((
      select sum(cm.quantity_kg)
      from public.commitments cm
      where cm.lot_id = l2.id
        and cm.status <> 'cancelled'
        and cm.payment_status in ('setup_complete', 'charge_succeeded')
        and (
          cm.campaign_id is null
          or exists (
            select 1
            from public.campaigns c
            where c.id = cm.campaign_id
              and c.status = 'active'
          )
        )
    ), 0) as v_sum
  from public.lots l2
  where l2.status in ('active', 'fully_committed')
) sub
where l.id = sub.lot_id
  and l.committed_quantity_kg is distinct from sub.v_sum;

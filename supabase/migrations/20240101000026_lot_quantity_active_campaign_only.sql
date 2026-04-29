-- Tighten update_lot_committed_quantity to only count commitments tied to
-- the lot's currently-active campaign.
--
-- Before this change, the trigger summed every commitment with
-- status <> 'cancelled'. That included status='confirmed' commits from a
-- prior settled cycle. After the lot was recycled to 'awaiting_relist'
-- and the seller relisted (lot → 'active'), the very next commitment on
-- a new campaign re-fired the trigger and rolled the prior cycle's
-- confirmed commits back into committed_quantity_kg — inflating the lot's
-- progress and the settle cron's minimumMet check.
--
-- New semantic: a commitment counts if it's not cancelled AND it belongs to
-- the lot's active campaign (or has no campaign at all — pre-campaigns-era
-- legacy data still counts).
--
-- Status guard on lot.status is unchanged: recycle_lot still owns the
-- canonical zero-write for awaiting_relist / draft / closed / expired lots.

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

  if v_status not in ('active', 'fully_committed') then
    return coalesce(new, old);
  end if;

  select coalesce(sum(cm.quantity_kg), 0)
    into v_sum
  from public.commitments cm
  where cm.lot_id = v_lot_id
    and cm.status <> 'cancelled'
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

-- Backfill: any currently-active lot whose committed_quantity_kg was inflated
-- by a prior cycle's confirmed commits gets recomputed under the new rule.
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

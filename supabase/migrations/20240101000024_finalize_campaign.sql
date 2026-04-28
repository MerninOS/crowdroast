-- Atomic campaign finalize + tighter committed-quantity trigger guard.
-- Addresses three blocking issues found in code review:
--   1. Campaign-cancel PATCH flipped status before recycle → on RPC failure
--      the campaign was permanently cancelled but the lot was unstranded only
--      via manual SQL.
--   2. Settle-deadlines settled-branch had the same hazard.
--   3. Settle-deadlines failed-branch had the same hazard.
--
-- Plus two majors:
--   * Concurrent settle-deadlines runs could clobber each other's writes
--     because the campaign update lacked a 'status=active' guard.
--   * The committed-quantity trigger preserved status on recycled lots but
--     still recomputed committed_quantity_kg from the live commitments
--     table — a refund webhook racing the recycle could leave an
--     awaiting_relist lot with a non-zero committed_quantity_kg.
--
-- This migration:
--   * Introduces public.finalize_campaign(p_campaign_id, p_outcome) which
--     locks the campaign row, no-ops if it isn't 'active' (idempotency +
--     concurrent-run safety), then atomically updates campaign + recycles
--     the lot in a single transaction.
--   * Tightens update_lot_committed_quantity to skip the entire UPDATE
--     when the lot is in a non-flippable status (awaiting_relist, draft,
--     closed, expired) — both status AND committed_quantity_kg are
--     preserved, instead of just status.

-- 1. Tighten the committed-quantity trigger.
-- The previous version preserved status on non-flippable lots but still
-- recomputed committed_quantity_kg from a live SUM of commitments, which
-- could resurrect a non-zero quantity on a recycled lot.
create or replace function public.update_lot_committed_quantity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot_id uuid;
  v_status text;
begin
  v_lot_id := coalesce(new.lot_id, old.lot_id);

  select status into v_status
  from public.lots
  where id = v_lot_id;

  -- Skip the entire recompute on non-flippable lots. recycle_lot owns the
  -- canonical committed_quantity_kg=0 write for those states.
  if v_status not in ('active', 'fully_committed') then
    return coalesce(new, old);
  end if;

  update public.lots
  set committed_quantity_kg = (
    select coalesce(sum(quantity_kg), 0)
    from public.commitments
    where lot_id = v_lot_id
      and status not in ('cancelled')
  ),
  status = case
    when (
      select coalesce(sum(quantity_kg), 0)
      from public.commitments
      where lot_id = v_lot_id
        and status not in ('cancelled')
    ) >= total_quantity_kg then 'fully_committed'
    else 'active'
  end,
  updated_at = now()
  where id = v_lot_id;

  return coalesce(new, old);
end;
$$;

-- 2. finalize_campaign RPC. Atomic terminal-state transition.
-- Outcome must be one of: 'settled', 'failed', 'cancelled'.
-- If the campaign is not currently 'active' (already finalized, or
-- concurrent run beat us to it), the function is a no-op. The row-level
-- lock prevents two concurrent callers from both winning.
create or replace function public.finalize_campaign(
  p_campaign_id uuid,
  p_outcome text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot_id uuid;
  v_current_status text;
begin
  if p_outcome not in ('settled', 'failed', 'cancelled') then
    raise exception 'Invalid outcome: %', p_outcome;
  end if;

  -- Lock the campaign row and read its current state.
  select lot_id, status
    into v_lot_id, v_current_status
  from public.campaigns
  where id = p_campaign_id
  for update;

  if v_current_status is null then
    raise exception 'Campaign not found: %', p_campaign_id;
  end if;

  -- Idempotent + concurrent-safe: only act when the campaign is still active.
  if v_current_status <> 'active' then
    return;
  end if;

  -- For 'cancelled' outcomes, the route doesn't pre-cancel commitments —
  -- this RPC owns that write. For 'settled' and 'failed', the
  -- settle-deadlines route already updated commitments per-Stripe-action
  -- before calling here, so we leave them alone.
  if p_outcome = 'cancelled' then
    update public.commitments
    set status = 'cancelled',
        payment_error = 'Campaign was cancelled by hub owner'
    where campaign_id = p_campaign_id
      and status <> 'cancelled';
  end if;

  -- Update campaign to terminal status.
  update public.campaigns
  set status = p_outcome,
      settled_at = case when p_outcome = 'settled' then now() else null end
  where id = p_campaign_id;

  -- Recycle the lot: clear hub catalogs, transition status, null featured-lot
  -- references. Inlined here (rather than calling recycle_lot) because we're
  -- inside one transaction already.
  delete from public.hub_lots where lot_id = v_lot_id;

  update public.lots
  set status = 'awaiting_relist',
      committed_quantity_kg = 0,
      settlement_processed_at = now(),
      updated_at = now()
  where id = v_lot_id;

  update public.hubs
  set featured_lot_id = null
  where featured_lot_id = v_lot_id;
end;
$$;

revoke all on function public.finalize_campaign(uuid, text) from public;
revoke all on function public.finalize_campaign(uuid, text) from anon, authenticated;
grant execute on function public.finalize_campaign(uuid, text) to service_role;

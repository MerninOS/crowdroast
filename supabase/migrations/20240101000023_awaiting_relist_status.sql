-- Campaign Close — Lot Recycling
-- See: ~/Documents/crowdroast/campaign-close-lot-recycling/spec.md
--
-- Adds 'awaiting_relist' status, guards the committed-quantity trigger from
-- flipping status away from non-flippable states, and introduces the
-- public.recycle_lot RPC that atomically:
--   1. removes a lot from every hub_lots row
--   2. transitions the lot to 'awaiting_relist' with committed_quantity_kg=0
--   3. nulls hubs.featured_lot_id wherever it referenced this lot
--
-- The RPC runs as SECURITY DEFINER and is granted only to service_role so it
-- can never be invoked from the client.

-- 1. Extend the lots status check to include awaiting_relist.
-- 'expired' stays in the constraint per spec (no longer set by app code, but
-- existing data and back-compat reads remain valid).
alter table public.lots
  drop constraint if exists lots_status_check;

alter table public.lots
  add constraint lots_status_check
  check (status in (
    'draft',
    'active',
    'awaiting_relist',
    'fully_committed',
    'shipped',
    'delivered',
    'closed',
    'expired'
  ));

-- 2. Replace update_lot_committed_quantity with a status-guarded version.
-- committed_quantity_kg always recomputes (correct for audit). The status
-- flip only fires when current status is one of the flippable values; this
-- prevents late refund webhooks or manual data fixes from silently flipping
-- a recycled lot back to 'active'.
create or replace function public.update_lot_committed_quantity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.lots
  set committed_quantity_kg = (
    select coalesce(sum(quantity_kg), 0)
    from public.commitments
    where lot_id = coalesce(new.lot_id, old.lot_id)
    and status not in ('cancelled')
  ),
  status = case
    when status not in ('active', 'fully_committed') then status
    when (
      select coalesce(sum(quantity_kg), 0)
      from public.commitments
      where lot_id = coalesce(new.lot_id, old.lot_id)
      and status not in ('cancelled')
    ) >= total_quantity_kg then 'fully_committed'
    else 'active'
  end,
  updated_at = now()
  where id = coalesce(new.lot_id, old.lot_id);

  return coalesce(new, old);
end;
$$;

-- 3. recycle_lot RPC. Single transactional unit — partial failure rolls back.
create or replace function public.recycle_lot(p_lot_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.hub_lots
  where lot_id = p_lot_id;

  update public.lots
  set status = 'awaiting_relist',
      committed_quantity_kg = 0,
      settlement_processed_at = now(),
      updated_at = now()
  where id = p_lot_id;

  update public.hubs
  set featured_lot_id = null
  where featured_lot_id = p_lot_id;
end;
$$;

-- Lock the RPC down: never invokable by anon or authenticated, only by
-- the backend service role.
revoke all on function public.recycle_lot(uuid) from public;
revoke all on function public.recycle_lot(uuid) from anon, authenticated;
grant execute on function public.recycle_lot(uuid) to service_role;

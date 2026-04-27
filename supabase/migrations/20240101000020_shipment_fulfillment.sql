-- 020: Shipment fulfillment flow
-- Adds picked_up_at/picked_up_by to commitments and grants hub owners
-- read + update access to commitments for lots at their hubs.

-- 1. Add pickup columns to commitments
alter table public.commitments
  add column if not exists picked_up_at timestamptz,
  add column if not exists picked_up_by uuid references public.profiles(id);

-- 2. Index: fast lookup for "which commitments have been picked up for this lot?"
create index if not exists idx_commitments_picked_up
  on public.commitments (lot_id)
  where picked_up_at is not null;

-- 3. RLS SELECT: hub owners can read commitments for lots assigned to their hub
create policy "commitments_select_hub_owner"
  on public.commitments for select
  using (
    auth.uid() in (
      select h.owner_id
      from public.hubs h
      join public.lots l on l.hub_id = h.id
      where l.id = lot_id
    )
  );

-- 4. RLS UPDATE: hub owners can update commitments for lots at their hub
--    (used to set picked_up_at / picked_up_by)
create policy "commitments_update_hub_owner"
  on public.commitments for update
  using (
    auth.uid() in (
      select h.owner_id
      from public.hubs h
      join public.lots l on l.hub_id = h.id
      where l.id = lot_id
    )
  );

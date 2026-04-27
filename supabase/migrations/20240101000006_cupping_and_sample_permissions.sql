-- Add cupping scheduling to sample requests
alter table public.sample_requests
  add column if not exists cupping_scheduled_at timestamptz;

create index if not exists idx_sample_requests_hub_cupping
  on public.sample_requests (hub_id, cupping_scheduled_at);

-- Replace legacy sample policies where buyers requested samples.
drop policy if exists "samples_select_own" on public.sample_requests;
drop policy if exists "samples_insert_buyer" on public.sample_requests;
drop policy if exists "samples_update_involved" on public.sample_requests;

-- Sample requests are visible to:
-- 1) the requesting hub owner (buyer_id),
-- 2) the seller for the lot,
-- 3) active buyers in that hub (for cupping visibility),
-- 4) the hub owner.
create policy "samples_select_hub_flow" on public.sample_requests
for select using (
  auth.uid() = buyer_id
  or auth.uid() in (
    select seller_id from public.lots where id = lot_id
  )
  or auth.uid() in (
    select user_id
    from public.hub_members
    where hub_id = sample_requests.hub_id
      and status = 'active'
  )
  or auth.uid() in (
    select owner_id from public.hubs where id = sample_requests.hub_id
  )
);

-- Only a hub owner can create a sample request for a hub they own.
create policy "samples_insert_hub_owner" on public.sample_requests
for insert with check (
  auth.uid() = buyer_id
  and hub_id is not null
  and auth.uid() in (
    select owner_id from public.hubs where id = sample_requests.hub_id
  )
);

-- Only the requesting hub owner or the seller can update sample records.
create policy "samples_update_hub_owner_or_seller" on public.sample_requests
for update using (
  auth.uid() in (
    select seller_id from public.lots where id = lot_id
  )
  or (
    auth.uid() = buyer_id
    and auth.uid() in (
      select owner_id from public.hubs where id = sample_requests.hub_id
    )
  )
);

-- Hub access requests: buyers can request to join a hub.
-- Hub owners approve or deny from the members page.

create table if not exists public.hub_access_requests (
  id uuid primary key default gen_random_uuid(),
  hub_id uuid not null references public.hubs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'denied', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only one pending request per buyer at a time
create unique index if not exists idx_hub_access_requests_one_pending
  on public.hub_access_requests (user_id)
  where status = 'pending';

alter table public.hub_access_requests enable row level security;

-- Buyers can see their own requests
create policy "hub_access_requests_select_own"
  on public.hub_access_requests for select
  using (auth.uid() = user_id);

-- Hub owners can see requests for their hubs
create policy "hub_access_requests_select_hub_owner"
  on public.hub_access_requests for select
  using (
    auth.uid() in (select owner_id from public.hubs where id = hub_id)
  );

-- Buyers can insert requests (for themselves only)
create policy "hub_access_requests_insert_own"
  on public.hub_access_requests for insert
  with check (auth.uid() = user_id);

-- Hub owners can update requests for their hubs (approve/deny)
create policy "hub_access_requests_update_hub_owner"
  on public.hub_access_requests for update
  using (
    auth.uid() in (select owner_id from public.hubs where id = hub_id)
  );

-- Enforce one active hub per buyer.
-- A buyer can only have one hub_members row with status = 'active'.
create unique index if not exists idx_hub_members_one_active_per_buyer
  on public.hub_members (user_id)
  where status = 'active';

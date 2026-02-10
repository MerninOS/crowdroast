-- Hub-centric model: Hub Owners are middlemen between buyers and sellers
-- Buyers only see lots curated by their hub. No direct buyer-seller relationship.

-- hub_lots: which seller lots a hub owner has chosen to feature
create table if not exists public.hub_lots (
  id uuid primary key default gen_random_uuid(),
  hub_id uuid not null references public.hubs(id) on delete cascade,
  lot_id uuid not null references public.lots(id) on delete cascade,
  added_at timestamptz default now(),
  unique(hub_id, lot_id)
);

alter table public.hub_lots enable row level security;

-- Hub owners can manage their own hub_lots
create policy "hub_lots_select_all" on public.hub_lots for select using (true);
create policy "hub_lots_insert_owner" on public.hub_lots for insert with check (
  auth.uid() in (select owner_id from public.hubs where id = hub_id)
);
create policy "hub_lots_delete_owner" on public.hub_lots for delete using (
  auth.uid() in (select owner_id from public.hubs where id = hub_id)
);

-- hub_members: buyers belonging to a hub (invited or manually added)
create table if not exists public.hub_members (
  id uuid primary key default gen_random_uuid(),
  hub_id uuid not null references public.hubs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text default 'buyer' check (role in ('buyer', 'admin')),
  invited_email text,
  status text default 'active' check (status in ('invited', 'active', 'removed')),
  joined_at timestamptz default now(),
  unique(hub_id, user_id)
);

alter table public.hub_members enable row level security;

-- Hub owners can manage members, members can see their own membership
create policy "hub_members_select" on public.hub_members for select using (
  auth.uid() = user_id or
  auth.uid() in (select owner_id from public.hubs where id = hub_id)
);
create policy "hub_members_insert_owner" on public.hub_members for insert with check (
  auth.uid() in (select owner_id from public.hubs where id = hub_id)
);
create policy "hub_members_update_owner" on public.hub_members for update using (
  auth.uid() in (select owner_id from public.hubs where id = hub_id)
);
create policy "hub_members_delete_owner" on public.hub_members for delete using (
  auth.uid() in (select owner_id from public.hubs where id = hub_id)
);

-- Update sample_requests: rename buyer_id to requester_id conceptually
-- Hub owners request samples from sellers, not buyers
-- Add a hub_id column to sample_requests so we know which hub requested
alter table public.sample_requests add column if not exists hub_id uuid references public.hubs(id);

-- Update commitments: add hub_id so commitments are tracked through the hub
alter table public.commitments add column if not exists hub_id uuid references public.hubs(id);

-- Update claims: add hub_id so claims go through the hub
alter table public.claims add column if not exists hub_id uuid references public.hubs(id);

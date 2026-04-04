-- Exclusive Lot Campaigns: time-boxed commitment windows for hub lots.
-- A campaign wraps a single lot within a hub with a deadline and settlement lifecycle.

-- 1. campaigns table
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.lots(id) on delete cascade,
  hub_id uuid not null references public.hubs(id) on delete cascade,
  deadline timestamptz not null,
  status text not null default 'active'
    check (status in ('active', 'settled', 'failed', 'cancelled')),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

-- Only one active campaign per lot at any time
create unique index if not exists idx_one_active_campaign_per_lot
  on public.campaigns (lot_id)
  where status = 'active';

-- Fast lookup for the settlement cron
create index if not exists idx_campaigns_deadline_status
  on public.campaigns (deadline, status)
  where status = 'active';

-- 2. Add expiry_date to lots
alter table public.lots add column if not exists expiry_date timestamptz;

-- Backfill from existing commitment_deadline
update public.lots
  set expiry_date = commitment_deadline
  where expiry_date is null
    and commitment_deadline is not null;

-- 3. Add campaign_id to commitments
alter table public.commitments add column if not exists campaign_id uuid references public.campaigns(id);

create index if not exists idx_commitments_campaign_id
  on public.commitments (campaign_id)
  where campaign_id is not null;

-- 4. RLS for campaigns
alter table public.campaigns enable row level security;

-- Hub owners can see their own hub's campaigns
create policy "campaigns_select_hub_owner"
  on public.campaigns for select
  using (
    auth.uid() in (select owner_id from public.hubs where id = hub_id)
  );

-- Hub owners can create campaigns for their hubs
create policy "campaigns_insert_hub_owner"
  on public.campaigns for insert
  with check (
    auth.uid() in (select owner_id from public.hubs where id = hub_id)
  );

-- Hub owners can update their own hub's campaigns
create policy "campaigns_update_hub_owner"
  on public.campaigns for update
  using (
    auth.uid() in (select owner_id from public.hubs where id = hub_id)
  );

-- Buyers can see campaigns for hubs they belong to
create policy "campaigns_select_buyer"
  on public.campaigns for select
  using (
    auth.uid() in (
      select user_id from public.hub_members
      where hub_id = campaigns.hub_id
        and status = 'active'
    )
  );

-- Sellers can see campaigns for their lots
create policy "campaigns_select_seller"
  on public.campaigns for select
  using (
    auth.uid() in (select seller_id from public.lots where id = lot_id)
  );

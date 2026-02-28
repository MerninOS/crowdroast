-- CrowdRoast Database Schema
-- Profiles table (extends auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('buyer', 'seller', 'hub_owner', 'admin')),
  company_name text,
  contact_name text,
  email text,
  phone text,
  address text,
  city text,
  state text,
  country text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
create policy "profiles_select_public" on public.profiles for select using (true);

-- Hubs table
create table if not exists public.hubs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  address text,
  city text,
  state text,
  country text,
  capacity_kg numeric default 0,
  used_capacity_kg numeric default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.hubs enable row level security;

create policy "hubs_select_all" on public.hubs for select using (true);
create policy "hubs_insert_owner" on public.hubs for insert with check (auth.uid() = owner_id);
create policy "hubs_update_owner" on public.hubs for update using (auth.uid() = owner_id);
create policy "hubs_delete_owner" on public.hubs for delete using (auth.uid() = owner_id);

-- Lots table (coffee listings)
create table if not exists public.lots (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  hub_id uuid references public.hubs(id),
  title text not null,
  origin_country text not null,
  region text,
  farm text,
  variety text,
  process text,
  altitude_min integer,
  altitude_max integer,
  crop_year text,
  score numeric,
  description text,
  total_quantity_kg numeric not null,
  committed_quantity_kg numeric default 0,
  min_commitment_kg numeric default 1,
  price_per_kg numeric not null,
  currency text default 'USD',
  status text default 'active' check (status in ('draft', 'active', 'fully_committed', 'shipped', 'delivered', 'closed')),
  commitment_deadline timestamptz,
  images text[] default '{}',
  flavor_notes text[] default '{}',
  certifications text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.lots enable row level security;

create policy "lots_select_all" on public.lots for select using (true);
create policy "lots_insert_seller" on public.lots for insert with check (auth.uid() = seller_id);
create policy "lots_update_seller" on public.lots for update using (auth.uid() = seller_id);
create policy "lots_delete_seller" on public.lots for delete using (auth.uid() = seller_id);

-- Commitments table
create table if not exists public.commitments (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.lots(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  quantity_kg numeric not null,
  price_per_kg numeric not null,
  total_price numeric not null,
  status text default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'shipped', 'delivered')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.commitments enable row level security;

create policy "commitments_select_own" on public.commitments for select using (
  auth.uid() = buyer_id or
  auth.uid() in (select seller_id from public.lots where id = lot_id)
);
create policy "commitments_insert_buyer" on public.commitments for insert with check (auth.uid() = buyer_id);
create policy "commitments_update_involved" on public.commitments for update using (
  auth.uid() = buyer_id or
  auth.uid() in (select seller_id from public.lots where id = lot_id)
);

-- Sample requests
create table if not exists public.sample_requests (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.lots(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  quantity_grams numeric default 100,
  shipping_address text,
  status text default 'pending' check (status in ('pending', 'approved', 'shipped', 'delivered', 'rejected')),
  tracking_number text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.sample_requests enable row level security;

create policy "samples_select_own" on public.sample_requests for select using (
  auth.uid() = buyer_id or
  auth.uid() in (select seller_id from public.lots where id = lot_id)
);
create policy "samples_insert_buyer" on public.sample_requests for insert with check (auth.uid() = buyer_id);
create policy "samples_update_involved" on public.sample_requests for update using (
  auth.uid() = buyer_id or
  auth.uid() in (select seller_id from public.lots where id = lot_id)
);

-- Shipments table
create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.lots(id) on delete cascade,
  hub_id uuid references public.hubs(id),
  origin_address text,
  destination_address text,
  carrier text,
  tracking_number text,
  status text default 'pending' check (status in ('pending', 'in_transit', 'at_hub', 'out_for_delivery', 'delivered')),
  shipped_at timestamptz,
  delivered_at timestamptz,
  weight_kg numeric,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.shipments enable row level security;

create policy "shipments_select_involved" on public.shipments for select using (true);
create policy "shipments_insert_seller" on public.shipments for insert with check (
  auth.uid() in (select seller_id from public.lots where id = lot_id)
);
create policy "shipments_update_involved" on public.shipments for update using (
  auth.uid() in (select seller_id from public.lots where id = lot_id) or
  auth.uid() in (select owner_id from public.hubs where id = hub_id)
);

-- Claims / Disputes
create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  commitment_id uuid not null references public.commitments(id) on delete cascade,
  filed_by uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('quality', 'quantity', 'damage', 'late_delivery', 'other')),
  description text not null,
  evidence_urls text[] default '{}',
  status text default 'open' check (status in ('open', 'under_review', 'resolved', 'rejected')),
  resolution text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.claims enable row level security;

create policy "claims_select_involved" on public.claims for select using (
  auth.uid() = filed_by or
  auth.uid() in (
    select buyer_id from public.commitments where id = commitment_id
    union
    select l.seller_id from public.lots l join public.commitments c on c.lot_id = l.id where c.id = commitment_id
  )
);
create policy "claims_insert_own" on public.claims for insert with check (auth.uid() = filed_by);
create policy "claims_update_own" on public.claims for update using (auth.uid() = filed_by);

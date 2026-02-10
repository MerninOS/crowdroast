-- Tiered Pricing Model
-- lots.min_commitment_kg = minimum TOTAL kg for the sale to trigger
-- lots.total_quantity_kg = maximum total kg available (cap)
-- lots.price_per_kg = base price (highest tier / starting price)
-- pricing_tiers = volume discount tiers

-- Pricing tiers table
create table if not exists public.pricing_tiers (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.lots(id) on delete cascade,
  min_quantity_kg numeric not null,
  price_per_kg numeric not null,
  created_at timestamptz default now()
);

alter table public.pricing_tiers enable row level security;

-- Everyone can view tiers (needed for buyer UI)
create policy "pricing_tiers_select_all" on public.pricing_tiers for select using (true);

-- Only the lot's seller can manage tiers
create policy "pricing_tiers_insert_seller" on public.pricing_tiers for insert with check (
  auth.uid() in (select seller_id from public.lots where id = lot_id)
);
create policy "pricing_tiers_update_seller" on public.pricing_tiers for update using (
  auth.uid() in (select seller_id from public.lots where id = lot_id)
);
create policy "pricing_tiers_delete_seller" on public.pricing_tiers for delete using (
  auth.uid() in (select seller_id from public.lots where id = lot_id)
);

-- Add an index for fast lookups by lot
create index if not exists idx_pricing_tiers_lot_id on public.pricing_tiers (lot_id);

-- Also allow hub owners to see commitments on lots in their hubs (for the backer list)
-- Drop and recreate the commitments select policy to be more permissive
drop policy if exists "commitments_select_own" on public.commitments;
create policy "commitments_select_involved" on public.commitments for select using (
  auth.uid() = buyer_id
  or auth.uid() in (select seller_id from public.lots where id = lot_id)
  or auth.uid() in (select owner_id from public.hubs where id = commitments.hub_id)
  or exists (
    select 1 from public.hub_members hm
    join public.hub_lots hl on hl.hub_id = hm.hub_id
    where hm.user_id = auth.uid()
      and hm.status = 'active'
      and hl.lot_id = commitments.lot_id
  )
);

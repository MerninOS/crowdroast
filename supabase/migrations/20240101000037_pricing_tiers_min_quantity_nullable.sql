-- Bag-aware campaign close: relax pricing_tiers.min_quantity_kg to NULLABLE.
--
-- The original schema (migration 20240101000004_tiered_pricing.sql) defined
-- min_quantity_kg as `numeric NOT NULL`. Migration #36 added min_bags as the
-- new bag-count threshold but kept min_quantity_kg in place so Stage 1-3
-- readers wouldn't break mid-cutover.
--
-- Stage 3 Task 3.3 now teaches POST /api/lots to persist new tier rows with
-- min_bags set and min_quantity_kg NULL — that requires the NOT NULL to be
-- relaxed. Existing tier rows are left untouched (still carry kg values).
--
-- The hard drop of min_quantity_kg happens in the *next* migration, deferred
-- to Stage 4 / Task 4.11 once every reader has switched to min_bags.
--
-- Reversible: setting NULL on an existing NOT NULL column is a metadata-only
-- change in Postgres; no table rewrite, no rows touched.

alter table public.pricing_tiers
  alter column min_quantity_kg drop not null;

comment on column public.pricing_tiers.min_quantity_kg is
  'DEPRECATED — kg threshold for legacy tiers. NULL for tiers written after the bag-aware cutover (use min_bags instead). Dropped entirely in migration #38 once Stage 4 ships.';

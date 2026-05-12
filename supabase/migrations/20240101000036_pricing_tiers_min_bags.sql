-- Bag-aware campaign close: pricing_tiers cutover (step 1 of 2).
--
-- The tier model is moving from "kg threshold → price" to "bag count → price"
-- so settlement can resolve a price tier from the count of completed bags
-- (see Task 4.1). This migration is the *cutover-safe half* of that change:
--
--   * Adds pricing_tiers.min_bags (nullable). Existing rows are left at NULL
--     on purpose — we do NOT auto-convert min_quantity_kg into min_bags.
--     A silent ceil(min_quantity_kg / bag_size_kg) conversion would bake in
--     a guess about each lot's bag size before the seller has set one, and
--     would let stale legacy tiers quietly drive real settlement math.
--     Forcing min_bags = NULL routes every existing tier through the Stage 3
--     backfill UI (Task 3.6), where the seller re-confirms the bag mapping.
--
--   * Keeps pricing_tiers.min_quantity_kg in place. Stage 1–3 readers still
--     reference it, and dropping it here would break them mid-cutover.
--     Migration #37 (20240101000037_drop_min_quantity_kg.sql, deferred to
--     Stage 4 / Task 4.11) removes the legacy column once every reader has
--     switched to min_bags.
--
-- RLS is untouched: the existing policies on pricing_tiers cover the new
-- column automatically (column-level grants follow the table grants).

alter table public.pricing_tiers
  add column if not exists min_bags integer
    check (min_bags is null or min_bags >= 1);

comment on column public.pricing_tiers.min_bags is
  'Minimum completed bags required for this tier price to apply. NULL = legacy tier that needs seller re-conversion via the Stage 3 backfill UI before settlement will honor it. Coexists with min_quantity_kg during cutover; min_quantity_kg is dropped in migration #37.';

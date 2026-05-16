-- Bag-aware settlement: store per-buyer bag kg as numeric, not integer.
--
-- THE BUG
-- Buyers commit in pounds; the commit form converts to kg with full
-- precision, so `commitments.quantity_kg` is `numeric` and routinely
-- fractional (e.g. 9.07185 kg = exactly 20 lb, 50.9 kg, ...).
--
-- Bag-aware settlement (`app/api/payments/settle-deadlines/route.ts`)
-- splits each commitment's quantity into per-completed-bag portions via
-- `expandToBagPortions` (lib/bag-assignment.ts) and writes one
-- `commitment_bag_charges` row per (commitment, bag). Those portion kg are
-- just as fractional as the source commitments — and the kg that completes
-- a bag to exactly bag_size is whatever sliver is left over.
--
-- But three destination columns were declared `integer`:
--   * commitment_bag_charges.kg           (+ CHECK (kg > 0))
--   * commitments.kg_locked_at_settlement
--   * commitments.kg_refunded_at_settlement
--
-- Two failure modes resulted:
--
--  1. HARD WEDGE (the reported bug). When a campaign's commitments sum to
--     just over a bag boundary, the last buyer's portion that completes
--     the bag can be a sub-1kg sliver. Example: 9.07185 + 50.9 + 9.07185
--     = 69.0437 kg with a 60 kg bag → bag 1 fills to 60.0 with the third
--     buyer contributing only 0.02815 kg. Postgres rounds 0.02815 → 0 on
--     insert into the `integer` column, which violates
--     `commitment_bag_charges_kg_check (kg > 0)`. Because settle-deadlines
--     inserts every bag-charge row in ONE batched upsert, the whole insert
--     is rejected. The route then skips kg_locked stamping, the
--     unallocated-cancel pass, AND finalize_campaign (all gated on the
--     insert succeeding), so the campaign is stranded `active` past its
--     deadline forever: nobody is charged, nobody is refunded, every
--     commitment shows "Funds Held" on the buyer dashboard indefinitely,
--     and the lot never recycles.
--
--  2. SILENT DRIFT. Even when the sliver rounds to >= 1 (so the upsert
--     succeeds), `integer` corrupts the real values — 9.07185 → 9,
--     50.9 → 51 — so kg_locked_at_settlement, the per-row charge kg, and
--     the derived shipment weight all diverge from the true bag math on
--     campaigns that DO settle.
--
-- THE FIX
-- Widen the three columns to `numeric` so they faithfully store the same
-- precision as `commitments.quantity_kg`. The existing
-- `commitment_bag_charges_kg_check (kg > 0)` survives an ALTER COLUMN TYPE
-- and stays correct for numeric (0.02815 > 0 is true), so no
-- drop/recreate is needed. `lots.bag_size_kg` is deliberately left
-- `integer` — a bag's physical size is a whole number of kg; it is not
-- part of this bug.
--
-- No views or generated columns depend on these columns (verified against
-- prod before authoring), so the type change is mechanical and safe.
--
-- Historical rows: three commitments from previously-settled bag-aware
-- campaigns already have integer-truncated kg_locked_at_settlement values.
-- This migration does NOT backfill them — those campaigns already shipped
-- and the drift is sub-kg cosmetic; reconstructing the exact pre-rounding
-- value would require replaying bag assignment and is out of scope for the
-- wedge fix. New settlements (and the data-repair for the stranded
-- campaign) write full-precision values from here on.

alter table public.commitment_bag_charges
  alter column kg type numeric using kg::numeric;

comment on column public.commitment_bag_charges.kg is
  'Buyer''s kg contribution to this specific bag, from expandToBagPortions. numeric (not integer) because commitments.quantity_kg is fractional (lb→kg conversion); the bag-completing sliver can be well under 1 kg. Always > 0 (CHECK); rows are never created for zero-kg contributions or for incomplete bags.';

alter table public.commitments
  alter column kg_locked_at_settlement type numeric
    using kg_locked_at_settlement::numeric,
  alter column kg_refunded_at_settlement type numeric
    using kg_refunded_at_settlement::numeric;

comment on column public.commitments.kg_locked_at_settlement is
  'kg the buyer actually purchased after bag-aware settlement (NULL pre-settlement). numeric to match the fractional precision of quantity_kg and commitment_bag_charges.kg.';

comment on column public.commitments.kg_refunded_at_settlement is
  'kg refunded to the buyer because they landed in an unfilled bag (NULL pre-settlement). numeric to match the fractional precision of quantity_kg.';

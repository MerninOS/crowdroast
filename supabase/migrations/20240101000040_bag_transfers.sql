-- Bag-aware campaign close: per-bag transfer-out ledger (Task 4.11).
--
-- WHAT THIS TABLE IS
-- One row per (lot, completed bag) that has had its seller + hub Stripe
-- transfers fired after the bag's `commitment_bag_charges` rows all reached
-- a terminal state. Acts as the durable idempotency record for the
-- bag-aware transfer-out side-effect: a row's presence means "we've already
-- moved the money for this bag — don't fire again."
--
-- WHY NOT QUERY STRIPE
-- The natural alternative is to ask Stripe's `/transfers` for a transfer
-- carrying the deterministic idempotency key. That works but costs a
-- round-trip per charge-worker tick, multiplied by every (lot, bag) the
-- worker has ever touched. A local primary-key lookup is two orders of
-- magnitude cheaper and gives us exact-once semantics via the PK constraint
-- — a concurrent second worker that tries to insert will hit a duplicate-key
-- error and abort cleanly without re-firing Stripe.
--
-- WHEN ROWS ARE WRITTEN
-- Only by `lib/bag-transfer-out.ts`, which is itself invoked as a
-- fire-and-forget side-effect at the end of the charge worker once a
-- `commitment_bag_charges` row goes terminal (`charged` or `payment_failed`).
-- The transfer-out function first checks all sibling rows for the same
-- (lot, bag) are terminal, then computes the bag's settled-revenue split,
-- then inserts here in the same flow that calls Stripe.
--
-- SPLIT MATH (recorded for forensic reasons)
-- For a bag whose buyers paid a total of T cents (sum of `amount_cents`
-- across `charged` rows only — `payment_failed` rows did not pay):
--   • seller_amount = round(kg_charged × seller_price_per_kg × 100)
--   • hub_amount    = floor(seller_base × HUB_SHARE_BPS / 10000) capped to T
--   • platform_keeps = T − seller_amount − hub_amount
--
-- The bag-aware model is simpler than the legacy path: no per-buyer refund
-- adjustment (kg in unfilled bags were never charged), and Stripe processing
-- fees are absorbed out of the platform share rather than scraped from a
-- specific charge's BalanceTransaction. The platform's general Stripe
-- balance covers both transfers (we drop `source_transaction` — see
-- `createBagTransfer` in `lib/stripe.ts`).

create table if not exists public.bag_transfers (
  lot_id uuid not null references public.lots(id) on delete cascade,
  bag_number integer not null check (bag_number >= 1),
  currency text not null,
  -- Aggregate cents we moved (split as recorded above). Useful for finance
  -- reconciliation without a Stripe round-trip; not relied on by code.
  seller_amount_cents integer not null check (seller_amount_cents >= 0),
  hub_amount_cents integer not null check (hub_amount_cents >= 0),
  platform_amount_cents integer not null check (platform_amount_cents >= 0),
  -- Stripe identifiers for the two transfers we fired. NULLable so a future
  -- "seller-only" or "hub-only" recovery path stays expressible. In the
  -- happy path both are populated.
  seller_transfer_id text,
  hub_transfer_id text,
  transferred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- (lot, bag) is globally unique within the bag-aware model: each lot's
  -- bags are 1-indexed and a bag belongs to exactly one lot. Composite PK
  -- doubles as the exact-once guard against concurrent worker ticks.
  primary key (lot_id, bag_number)
);

comment on table public.bag_transfers is
  'Per-(lot, bag) transfer-out ledger for the bag-aware (charge-on-fill) settlement model. One row per bag means "seller + hub transfers have been fired." Created by lib/bag-transfer-out.ts after all commitment_bag_charges rows for the bag reach a terminal state.';

comment on column public.bag_transfers.lot_id is
  'FK to the lot the bag belongs to. The lot row carries seller_id (transfer destination) and currency.';

comment on column public.bag_transfers.bag_number is
  '1-indexed bag position within the campaign. Combined with lot_id, the composite PK enforces exact-once transfer per bag.';

comment on column public.bag_transfers.currency is
  'Three-letter currency code of the underlying lot. Stored to allow a finance audit to reconcile without re-joining lots.';

comment on column public.bag_transfers.seller_amount_cents is
  'Cents moved to the seller''s Stripe Connect account. Equal to kg_charged × seller_price_per_kg × 100, rounded. The buyer-side platform fee is NOT included here — sellers receive their base price.';

comment on column public.bag_transfers.hub_amount_cents is
  'Cents moved to the hub owner''s Stripe Connect account. 2% (HUB_SHARE_BPS=200) of the seller-base. Capped at total − seller to stay solvent for tiny rounding.';

comment on column public.bag_transfers.platform_amount_cents is
  'Cents retained on the platform''s main Stripe balance after the seller + hub transfers. = total_buyer_paid − seller − hub. Stripe processing fees are debited against this amount, not transferred — the platform absorbs them.';

comment on column public.bag_transfers.seller_transfer_id is
  'Stripe transfer id from `/v1/transfers` for the seller payout. NULL only if a partial failure (seller fired, hub did not) is being recovered.';

comment on column public.bag_transfers.hub_transfer_id is
  'Stripe transfer id from `/v1/transfers` for the hub payout. NULL only during partial recovery.';

comment on column public.bag_transfers.transferred_at is
  'Wall-clock instant the row was inserted (i.e. the transfers were fired). Distinct from created_at to allow a future backfill that records historical bag transfers with an explicit transferred_at.';

-- INDEXES
-- The PK already covers (lot_id, bag_number) lookups (the read path in
-- transferOutBagIfReady). No additional index needed — bag_transfers is
-- written-rarely (once per bag), read-rarely (once per bag, by the same
-- worker that wrote it), and never scanned by user-facing queries.

-- ROW LEVEL SECURITY
-- Mirrors `commitment_bag_charges` (migration #38): service-role-only writes,
-- buyers and sellers can SELECT rows scoped to their relationship with the
-- lot. Buyers via commitment_bag_charges → commitments.buyer_id; sellers
-- directly via lots.seller_id. Hub owners can read their own payouts via
-- campaigns → hubs.owner_id. No INSERT/UPDATE/DELETE policies — only
-- service-role (which bypasses RLS) ever writes here.
alter table public.bag_transfers enable row level security;

create policy "bag_transfers_select_buyer" on public.bag_transfers
  for select
  using (
    lot_id in (
      select lot_id from public.commitments where buyer_id = auth.uid()
    )
  );

create policy "bag_transfers_select_seller" on public.bag_transfers
  for select
  using (
    lot_id in (
      select id from public.lots where seller_id = auth.uid()
    )
  );

create policy "bag_transfers_select_hub_owner" on public.bag_transfers
  for select
  using (
    lot_id in (
      select lot_id from public.campaigns
      where hub_id in (
        select id from public.hubs where owner_id = auth.uid()
      )
    )
  );

-- Bag-aware transfer-out retry support.
--
-- WHAT THIS MIGRATION ADDS
-- Two columns on `bag_transfers` so a failed transfer attempt can be
-- recorded in-place and re-driven on the next worker tick:
--   • `attempt_count`  — how many times we've tried to fire the bag's
--                        Stripe transfers. Increments per attempt
--                        (failure or success).
--   • `failed_reason`  — populated when the latest attempt failed.
--                        NULL once the bag is fully transferred.
--
-- WHY
-- The pre-fix flow only INSERTed a `bag_transfers` row on full success.
-- A seller-transfer failure (e.g. Stripe `insufficient_funds` when the
-- platform balance hasn't cleared yet) returned `'skipped'` without
-- writing anything, leaving the bag invisibly stuck: every sibling
-- `commitment_bag_charges` row was already `charged`, so the worker's
-- next tick — which filters on `awaiting_charge | retry_scheduled |
-- charging` — never picked them up again to re-trigger transfer-out.
-- The seller's money was charged from the buyer but never paid out.
--
-- With these columns the worker can detect "this bag was charged but
-- transfer hasn't completed" via `seller_transfer_id IS NULL AND
-- seller_amount_cents > 0`, increment `attempt_count`, and retry with
-- a fresh Stripe idempotency key (the key includes `attempt_count` as
-- a suffix). Stripe's idempotency cache poisons the failed key for
-- 24h, so a deterministic key would replay the cached failure on every
-- retry — the suffix breaks that.
--
-- INTERPRETING THE COLUMNS
-- A `bag_transfers` row's state is now a four-way:
--   1. Done — seller_transfer_id IS NOT NULL (single-row bags) or all
--      per-row transfer ids populated (multi-row bags). Money moved.
--   2. Zero-amount sentinel — all _amount_cents = 0 and all _transfer_id
--      = NULL and `failed_reason IS NULL`. Bag had no charged rows so
--      there was nothing to transfer; the row exists to stop the worker
--      from re-evaluating every tick.
--   3. Retry needed — seller_amount_cents > 0 and seller_transfer_id IS
--      NULL and `failed_reason IS NOT NULL`. Worker will pick this up
--      and re-attempt with `attempt_count + 1`.
--   4. Partial — seller_transfer_id IS NOT NULL but hub_transfer_id IS
--      NULL with hub_amount_cents > 0. Seller leg done, hub leg failed,
--      retry hub only.
--
-- BACKFILL
-- Existing rows get `attempt_count = 1` (the default) because they
-- were fully transferred in one shot pre-fix. None had failures.

alter table public.bag_transfers
  add column if not exists attempt_count integer not null default 1
    check (attempt_count >= 1),
  add column if not exists failed_reason text;

comment on column public.bag_transfers.attempt_count is
  'Number of times the worker has tried to fire the bag''s Stripe transfers (failure or success). Used as a suffix on the Stripe idempotency key so a retry after a transient error (e.g. platform balance insufficient) does not replay the cached failure.';

comment on column public.bag_transfers.failed_reason is
  'Populated when the latest transfer attempt failed. NULL once the bag is fully transferred. The worker uses (seller_transfer_id IS NULL AND seller_amount_cents > 0) AND/OR (hub_transfer_id IS NULL AND hub_amount_cents > 0) as the retry-needed signal; `failed_reason` carries the human-readable why for logs and admin tooling.';

-- Partial index for the retry sweep query — picks up bags whose seller
-- or hub leg hasn't completed yet. Cheap because the table only has one
-- row per (lot, bag) and the predicate hits a tiny subset.
create index if not exists bag_transfers_retry_needed_idx
  on public.bag_transfers (lot_id, bag_number)
  where (seller_transfer_id is null and seller_amount_cents > 0)
     or (hub_transfer_id    is null and hub_amount_cents    > 0);

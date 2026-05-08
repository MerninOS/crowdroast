-- Digest email tracking
--
-- Replaces per-event "new coffee" / "new campaign" emails with batched digests.
-- We store the last successful digest send on each recipient profile so the
-- cron job can find anything new since that timestamp without a queue table.

alter table public.profiles
  add column if not exists last_seller_coffees_digest_at timestamptz,
  add column if not exists last_hub_campaigns_digest_at timestamptz;

-- Bound the first-run lookback for any recipient that hasn't been digested
-- yet (NULL means "never sent"). Without bounding, a brand-new profile would
-- pull every coffee in the catalog. The cron coalesces NULL to (now() - 7d).

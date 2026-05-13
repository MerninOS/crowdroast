-- Bag-aware campaign close: per-commitment settlement-email idempotency stamp (Task 4.13).
--
-- WHAT THIS COLUMN IS
-- A single timestamptz marker on `commitments`. NULL means "we have not yet
-- sent the buyer their post-settlement summary email for this commitment."
-- A non-NULL value means the email has been dispatched (or at least the row
-- was stamped after a Resend call returned). The settlement-email trigger
-- (`lib/settlement-email-trigger.ts`) reads + writes this column.
--
-- WHY ON commitments AND NOT commitment_bag_charges
-- A buyer's settlement email summarizes ALL their bag charges for one
-- commitment (per-bag table + aggregate totals). Exactly one email per
-- commitment, regardless of how many bag rows it spawned. A per-row stamp on
-- commitment_bag_charges would force a multi-row guard that's harder to make
-- atomic; a per-commitment stamp lets the trigger use a single conditional
-- UPDATE ... WHERE settlement_email_sent_at IS NULL to win the race.
--
-- THE CAMPAIGN-FAILURE CASE
-- When a campaign fails under `min_bags_to_succeed` (Task 4.7), ZERO
-- commitment_bag_charges rows are created. The charge worker never runs for
-- those commits — but the settle-deadlines route iterates the campaign's
-- commits in that branch and calls the same trigger. The trigger's
-- "no rows exist" branch sends the failure-variant copy and stamps this
-- column the same way the success path does. So this stamp is the single
-- idempotency record for BOTH success and failure variants.
--
-- WHEN ROWS ARE STAMPED
--   * Worker (lib/charge-worker.ts) after the final terminal exit point of
--     the LAST sibling row for a commitment — only if all siblings are now
--     terminal AND the stamp is still NULL (atomic guard).
--   * settle-deadlines/route.ts campaign-failure branch — iterates affected
--     commits and stamps each one as it sends the failure-variant email.
--
-- WRITE GUARD
-- All writes go through `UPDATE commitments SET settlement_email_sent_at =
-- now() WHERE id = $1 AND settlement_email_sent_at IS NULL` — this is the
-- atomic conditional that prevents a concurrent worker tick + a settle-
-- deadlines retry from sending the email twice. The first write wins and
-- updates 1 row; the second sees 0 rows updated and the trigger's caller
-- treats it as `'already_sent'`.

alter table public.commitments
  add column if not exists settlement_email_sent_at timestamptz;

comment on column public.commitments.settlement_email_sent_at is
  'Idempotency marker for the AC10 post-settlement summary email. NULL means the email has not been sent for this commitment yet. Stamped atomically by lib/settlement-email-trigger.ts using a WHERE settlement_email_sent_at IS NULL conditional UPDATE so concurrent worker ticks cannot duplicate the send. One stamp covers BOTH the success variant (per-bag summary) and the campaign-failure variant (no charges made, no money moved).';

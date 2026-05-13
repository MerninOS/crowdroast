-- Bag-aware campaign close: consolidated review-finding schema fixes.
--
-- This migration resolves four review findings against the bag-aware campaign-
-- close work (B1, M1, M4, M6). Grouped into a single migration because the
-- changes are small, independently safe, and address the same review pass.
-- Each section below is self-documenting; nothing else in the codebase
-- depends on these changes landing as separate migrations.
--
-- =============================================================================
-- B1 — Column-level REVOKE on commitments financial fields
-- =============================================================================
--
-- WHY THIS EXISTS
-- The `commitments_update_involved` policy (created in migration #1,
-- 20240101000001_create_schema.sql, lines 106–109) lets the buyer OR the
-- seller-of-the-lot UPDATE any column on a commitment row they're involved
-- in. The policy is correct for the small set of fields buyers + sellers
-- legitimately edit (notes, status transitions, picked_up_at, updated_at),
-- but it's row-scoped — not column-scoped — so it transitively grants
-- buyers the ability to write financial state (`payment_status`,
-- `charge_amount_cents`, `stripe_*` ids, refund bookkeeping, settlement
-- stamps) that should ONLY be authored by service-role webhook handlers,
-- the charge worker, and admin endpoints.
--
-- PostgreSQL composes RLS with column privileges via logical AND: a write
-- is allowed only if BOTH the RLS policy USING/WITH CHECK passes AND the
-- role holds the necessary column privilege. By revoking UPDATE on
-- specific columns from `authenticated`, we keep `commitments_update_involved`
-- intact for the legitimate fields (notes, status, picked_up_at, etc.) while
-- making financial columns unwritable through supabase-js.
--
-- WHAT'S PRESERVED
-- The `commitments_update_involved` policy from migration #1 is untouched.
-- Buyers and sellers can still UPDATE the non-financial columns they
-- legitimately edit through the user-bound supabase-js client:
--   * notes              — buyer/seller free-text on the commitment
--   * status             — lifecycle transitions (e.g. cancelled, delivered)
--   * picked_up_at       — buyer marks pickup complete (used by
--                          app/api/commitments/[id]/route.ts pickup flow)
--   * picked_up_by       — buyer id at pickup time (same flow)
--   * updated_at         — touched by every UPDATE
--   * hub_id             — set on initial commitment routing
--   * charge_currency    — frozen at SetupIntent time, but allowed because
--                          it's part of the initial setup the buyer drives
--   * charged_at         — written by the buyer-side checkout-session sync
--                          flow (kept buyer-writable; the gating fields it
--                          accompanies are revoked, so the row's settled
--                          state can't be forged through this alone)
--   * refund_reason      — admin endpoints write via service-role, but
--                          buyer-self-cancel paths can record reason
--
-- HOW THIS ACTUALLY ENFORCES
-- Supabase grants `authenticated=arwdDxtm/postgres` (table-level UPDATE)
-- by default on every public table. A bare column-level REVOKE has no
-- effect while a table-level grant exists — PostgreSQL combines table
-- and column privileges by UNION. To make the column-level restriction
-- bite, we REVOKE the table-level UPDATE first, then GRANT UPDATE on
-- only the explicitly-allow-listed columns. The RLS policy
-- `commitments_update_involved` is unchanged; it still scopes WHICH ROWS
-- a user can write. The column grant scopes WHICH COLUMNS within those
-- rows.
--
-- WHEN THIS FIRES
-- At migration time only. No runtime cost. A buyer trying to PATCH a
-- revoked column through supabase-js will get a 401/permission-denied
-- from PostgREST before the row is even located. Service-role bypasses
-- table grants entirely, so webhook handlers, the charge worker, and
-- admin endpoints continue to write the revoked columns freely.
--
-- TASK
-- Resolves B1 (review finding: buyer can self-modify financial columns).

-- Strip the table-level UPDATE grant so column-level grants below become
-- the *only* path. SELECT/INSERT/DELETE are left untouched — only UPDATE
-- needs column-scoping.
revoke update on public.commitments from authenticated;

-- Re-grant UPDATE on the explicit allow-list of columns buyers + sellers
-- legitimately edit through the user-bound supabase-js client. Anything
-- NOT in this list (notably: payment_status, stripe_*, charge_amount_cents,
-- refund_*, kg_*_at_settlement, settlement_email_*, total_price,
-- price_per_kg, quantity_kg, payment_error) is now writable only via
-- service-role.
grant update (
  notes,
  status,
  picked_up_at,
  picked_up_by,
  updated_at,
  hub_id,
  charge_currency,
  charged_at,
  refund_reason
) on public.commitments to authenticated;

-- =============================================================================
-- M1 — Add hub_id to bag_transfers (cross-hub relist leakage fix)
-- =============================================================================
--
-- WHY THIS EXISTS
-- `bag_transfers_select_hub_owner` (migration #40, lines 124–133) scopes
-- hub-owner reads via `lot_id → campaigns.hub_id → hubs.owner_id`. The join
-- uses the CURRENT campaign for that lot. If a lot is relisted under a
-- different hub (the awaiting-relist → new-campaign flow), the new hub's
-- owner inherits visibility into the prior hub's bag transfers because the
-- join finds the freshest campaign, not the campaign that was settling when
-- the row was written.
--
-- FIX
-- Store `hub_id` directly on `bag_transfers` at insert time — recording the
-- hub that earned (or didn't earn) the payout for THAT bag, frozen at the
-- moment of transfer-out. Rewrite the hub-owner SELECT policy to filter on
-- this column instead of joining through `campaigns`.
--
-- BACKFILL
-- `bag_transfers` is empty in this branch (it's table introduced in
-- migration #40 and no production close has run on it yet). So adding the
-- column NOT NULL with no default is safe — there are no rows to populate.
-- If a row ever DOES exist before this migration applies, the migration
-- will fail on the NOT NULL — that's the right outcome: we want to know.
--
-- WHEN THIS FIRES
-- `lib/bag-transfer-out.ts` will be updated (separately, as part of M1's
-- code fix) to pass the campaign's hub_id at insert time. Service-role
-- writer; the column is part of the row, not a lookup.
--
-- TASK
-- Resolves M1 (review finding: relisted lot leaks prior-hub transfers).

alter table public.bag_transfers
  add column hub_id uuid not null references public.hubs(id);

comment on column public.bag_transfers.hub_id is
  'Hub that earned (or didn''t earn) the per-bag payout, frozen at transfer-out time. Set by lib/bag-transfer-out.ts to the campaign''s hub_id when the transfer was fired. Used by the hub-owner RLS policy so relisting a lot under a different hub does not leak prior transfers to the new hub owner.';

drop policy if exists "bag_transfers_select_hub_owner" on public.bag_transfers;

create policy "bag_transfers_select_hub_owner" on public.bag_transfers
  for select
  using (
    hub_id in (
      select id from public.hubs where owner_id = auth.uid()
    )
  );

-- =============================================================================
-- M4 — Add card_auth_failed_email_sent_at to commitments
-- =============================================================================
--
-- WHY THIS EXISTS
-- When a buyer's SetupIntent (card-on-file) probe fails — captured via the
-- Stripe webhook handler in Task 4.3b — we email the buyer once with a
-- "your card couldn't be authorized" notice and a re-onboard link. Stripe
-- delivers webhooks at-least-once, so retries are expected; without an
-- idempotency stamp on the row, a flapping `setup_intent.setup_failed`
-- delivery would multi-send.
--
-- This mirrors `settlement_email_sent_at` (migration #41): one nullable
-- timestamp; NULL means "not sent"; non-NULL means "sent at this instant."
-- The webhook handler will use the same atomic conditional UPDATE pattern:
--   UPDATE commitments
--      SET card_auth_failed_email_sent_at = now()
--    WHERE id = $1 AND card_auth_failed_email_sent_at IS NULL
-- A second webhook delivery sees `0 rows updated` and short-circuits without
-- re-sending.
--
-- WHEN THIS FIRES
-- Webhook-side only. Service-role writes. Reads from the buyer dashboard
-- are allowed via the existing `commitments_select_own` policy.
--
-- TASK
-- Resolves M4 (review finding: card-auth failure email lacks idempotency
-- guard on webhook retries).

alter table public.commitments
  add column if not exists card_auth_failed_email_sent_at timestamptz;

comment on column public.commitments.card_auth_failed_email_sent_at is
  'Idempotency marker for the card-authorization-failed email (Task 4.3b). NULL means the email has not been sent for this commitment yet. Stamped atomically by the Stripe webhook handler (setup_intent.setup_failed branch) using a WHERE card_auth_failed_email_sent_at IS NULL conditional UPDATE so concurrent or retried webhook deliveries cannot duplicate the send. Mirrors the settlement_email_sent_at pattern from migration #41.';

-- =============================================================================
-- M6 — Add settlement_email_status to commitments
-- =============================================================================
--
-- WHY THIS EXISTS
-- `settlement_email_sent_at` (migration #41) records that we ATTEMPTED to
-- send a settlement email — but Resend can return a non-2xx after our
-- atomic stamp wins. As written today, a send_failed call still leaves the
-- timestamp populated, marking the commitment as "done" forever. Adding a
-- discrete status column lets a daily sweeper (separate code task) find
-- and retry rows where `settlement_email_status = 'send_failed'` without
-- re-sending the rows where it succeeded.
--
-- DATA MODEL
-- TEXT, nullable. NULL means "we haven't attempted to send yet"
-- (settlement_email_sent_at is also NULL — they move together). Once
-- `lib/settlement-email-trigger.ts` calls Resend, it writes one of:
--   'sent'         — Resend returned 2xx
--   'send_failed'  — Resend returned non-2xx or threw
-- The atomic stamp pattern on settlement_email_sent_at still gates the
-- attempt; this column records the *outcome* of that attempt. The sweeper
-- finds `WHERE settlement_email_status = 'send_failed'`, resets both
-- columns to NULL, and the next trigger run re-attempts cleanly.
--
-- WHY NOT A BOOLEAN
-- A 2-value enum allows future expansion (e.g. 'bounced', 'complained')
-- without a schema migration, and reads better in admin queries.
--
-- WHEN THIS FIRES
-- `lib/settlement-email-trigger.ts` writes this column alongside
-- `settlement_email_sent_at`. Same service-role write path.
--
-- TASK
-- Resolves M6 (review finding: settlement email failure is unobservable
-- and unretryable).

alter table public.commitments
  add column if not exists settlement_email_status text
    check (settlement_email_status in ('sent', 'send_failed'));

comment on column public.commitments.settlement_email_status is
  'Outcome of the most recent settlement email attempt for this commitment. NULL means no attempt yet. ''sent'' means Resend returned 2xx. ''send_failed'' means Resend returned non-2xx or threw — the daily sweeper finds these rows, resets settlement_email_sent_at + this column to NULL, and lib/settlement-email-trigger.ts re-attempts. Written by the trigger alongside settlement_email_sent_at.';

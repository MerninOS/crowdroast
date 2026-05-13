-- Hotfix: revert migration #42's column-level UPDATE revoke on commitments.
--
-- BACKGROUND
-- Migration #42 was written in response to review-finding B1: a buyer could
-- self-modify `commitments.payment_error` to skip charges. The fix was a
-- table-level UPDATE revoke + column-level allow-list grant for the
-- `authenticated` role.
--
-- WHY WE'RE REVERTING
-- The codebase has multiple LEGITIMATE buyer-session UPDATEs on commitments
-- that touch columns outside the allow-list:
--   * `app/dashboard/buyer/commitments/page.tsx:52,68` — Stripe Checkout
--     sync-back on page render (payment_status, stripe_*, charged_at,
--     payment_error). Runs when the buyer returns from Stripe before the
--     webhook has had a chance to land.
--   * `app/api/commitments/route.ts:188` — `commitmentPayload` UPDATE of
--     an existing unpaid commitment. Touches payment_status, charge_amount_cents,
--     stripe_* etc.
--   * `app/api/commitments/route.ts:321` — error-fallback UPDATE setting
--     payment_status='charge_failed' + payment_error on Stripe failure.
--
-- After migration #42 landed, every commit attempt fails with
-- "permission denied for table commitments". Production-blocking.
--
-- WHAT THIS DOES
-- Reverts the column scope by re-granting table-level UPDATE on commitments
-- to `authenticated`. RLS row-scoping (commitments_update_involved) remains
-- in place — buyers still only update their own rows.
--
-- WHAT THIS LEAVES UNRESOLVED
-- B1 is again a theoretical attack vector (buyer can set their own
-- payment_error to skip charges). Mitigations in place today:
--   * RLS row-scoping limits the blast radius to a single buyer's own commits
--   * The charge worker logs failed_reason on every payment_failed row
--   * The admin Failed Payments dashboard surfaces these for manual review
--   * The bag still ships under the failed-payment fallback (AC14) so the
--     other buyers on the bag aren't affected
-- A proper B1 fix needs to be re-designed at the API-route boundary instead
-- of at the column-grant boundary — e.g., move the buyer-side sync-back
-- logic into a service-role-keyed API route that whitelists which values
-- the buyer can request.
--
-- The other parts of migration #42 (bag_transfers.hub_id, card_auth_failed_
-- email_sent_at on commitments, settlement_email_status on commitments) are
-- NOT reverted — those were correct and don't break anything.

grant update on public.commitments to authenticated;

-- The column-level GRANT statements from #42 become irrelevant once the
-- table-level grant is restored (Postgres unions privileges). Leaving them
-- in place is harmless. We do NOT drop the GRANT statements from #42 — if
-- someone later REVOKEs the table-level grant again, the column grants
-- become operative without an additional migration.

comment on table public.commitments is
  'Commit ledger. Migration #42 attempted a column-level UPDATE revoke on this table to defend against B1 (buyer self-modifying payment_error); see migration #43 for the revert rationale. Future B1 fixes should happen at the API-route boundary, not at the column-grant boundary.';

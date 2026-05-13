/**
 * Bag-aware campaign close — charge worker (Task 4.8).
 *
 * Processes one `commitment_bag_charges` row at a time. Implements the AC13
 * retry ladder: attempt 1 at settlement, attempt 2 at +12h, attempt 3 at
 * +48h after attempt 2 (≈+60h from attempt 1). After three failed attempts
 * the row is marked terminal `payment_failed` (AC14).
 *
 * Pure-ish: takes a Supabase admin client and a row, returns an outcome
 * tag. All Stripe and DB I/O is mockable through dependency injection in
 * tests. The cron route at `app/api/cron/process-bag-charges/route.ts`
 * does nothing more than select rows due for processing and call this
 * once per row.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createAndConfirmPaymentIntent,
  type StripePaymentIntent,
} from "@/lib/stripe";
import { sendPaymentUpdateRequiredEmail } from "@/lib/email";
import { transferOutBagIfReady } from "@/lib/bag-transfer-out";
import { sendSettlementEmailIfReady } from "@/lib/settlement-email-trigger";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://crowdroast.com";

// -------------------------------------------------------------------------
// Retry ladder timing (AC13).
// -------------------------------------------------------------------------
// `next_attempt_at` math is encoded here so it's exercised by tests and not
// scattered across the worker body. Constants in ms for arithmetic clarity.
const ONE_HOUR_MS = 60 * 60 * 1000;
const RETRY_DELAY_AFTER_ATTEMPT_1_MS = 12 * ONE_HOUR_MS; // 12h
const RETRY_DELAY_AFTER_ATTEMPT_2_MS = 48 * ONE_HOUR_MS; // 48h
const TRANSIENT_REQUEUE_DELAY_MS = 1 * ONE_HOUR_MS; // 1h

// Vercel Cron is fire-and-forget — a crashed worker leaves a row stuck in
// `'charging'`. The lease window is the wall-clock time we'll wait before
// another worker tick may reclaim the row. Five minutes is a comfortable
// upper bound on a single Stripe call's wall-time (Stripe SLO is well under
// this) and short enough that a real crash recovers within the next tick.
const LEASE_WINDOW_MS = 5 * 60 * 1000;

// Max attempts before terminal `payment_failed` (AC13/14).
const MAX_ATTEMPTS = 3;

// -------------------------------------------------------------------------
// Public types
// -------------------------------------------------------------------------

/**
 * Shape of a `commitment_bag_charges` row as read from the DB. Matches the
 * migration #38 schema. Kept narrow on purpose: only the columns the worker
 * needs are required, and joined data is fetched separately.
 */
export interface BagChargeRow {
  id: string;
  commitment_id: string;
  bag_number: number;
  kg: number;
  amount_cents: number;
  stripe_payment_intent_id: string | null;
  stripe_idempotency_key: string;
  payment_status:
    | "awaiting_charge"
    | "charging"
    | "charged"
    | "retry_scheduled"
    | "payment_failed";
  attempt_count: number;
  next_attempt_at: string | null;
  failed_reason: string | null;
  /**
   * Idempotency marker for the AC13 "update your card" email sent on the
   * 1→2 attempt-count transition. NULL means the email has not been sent
   * for this row yet. See migration #38 for column-level docs.
   */
  payment_update_email_sent_at: string | null;
}

/**
 * Joined buyer + lot fields the worker reads alongside the commitment so the
 * AC13 payment-update email has everything it needs without a second
 * round-trip. Kept narrow on purpose — Supabase's PostgREST resolves the
 * embedded selects into single-object shapes.
 */
interface BuyerForEmail {
  email: string | null;
  contact_name: string | null;
}
interface LotForEmail {
  title: string;
}

export type ProcessBagChargeOutcome =
  | "charged"
  | "retry_scheduled"
  | "payment_failed"
  | "skipped";

export interface ProcessBagChargeResult {
  outcome: ProcessBagChargeOutcome;
  reason?: string;
}

/**
 * Test-mode overrides for Stripe + clock. The cron route never passes these;
 * tests pass mocks. Kept on a single optional `deps` parameter so the
 * production call site stays a single positional arg.
 */
export interface ProcessBagChargeDeps {
  createAndConfirmPaymentIntent?: typeof createAndConfirmPaymentIntent;
  now?: () => Date;
}

// -------------------------------------------------------------------------
// Heuristic: did Stripe just have a bad day, or did the card actually decline?
// -------------------------------------------------------------------------
// `createAndConfirmPaymentIntent` throws `Error(message)` where `message` is
// whatever Stripe's `error.message` field returned. We can't easily inspect
// HTTP status from inside lib/stripe.ts (it just throws), so we treat the
// error message string as ground truth and look for the signature phrases
// Stripe uses for non-decline failures. Better to err on the side of "real
// decline" — a misclassified transient bumps `attempt_count` once and the
// retry ladder still runs. The opposite mistake (treating a decline as
// transient) would let a hopelessly-bad card chew through retries forever.
function isTransientStripeError(errMsg: string): boolean {
  const m = errMsg.toLowerCase();
  return (
    m.includes("rate limit") ||
    m.includes("api_connection_error") ||
    m.includes("api connection error") ||
    m.includes("api error") ||
    m.includes("api_error") ||
    // 5xx-bucket signature words from Stripe's typical messages
    m.includes("server error") ||
    m.includes("temporarily unavailable") ||
    // Network-class failures. NOT matching "try again" — Stripe uses that
    // phrase in real card-decline copy ("Your card was declined. Please
    // try again or use a different card."), which would misclassify a
    // genuine decline as transient and loop the row forever without
    // bumping attempt_count. M3 review fix.
    m.includes("timeout") ||
    m.includes("timed out")
  );
}

// -------------------------------------------------------------------------
// processBagCharge
// -------------------------------------------------------------------------

/**
 * Process a single `commitment_bag_charges` row through one Stripe attempt.
 *
 * Lifecycle:
 *   awaiting_charge ──┐
 *                     ├──▶ charging ──▶ charged                     (Stripe ok)
 *   retry_scheduled ──┘             ──▶ retry_scheduled              (decline, <3 attempts)
 *                                   ──▶ payment_failed              (decline, ≥3 attempts)
 *                                   ──▶ retry_scheduled (no-bump)   (transient/network)
 *                                   ──▶ payment_failed (no Stripe)  (auth-probe-failed)
 *
 * **Crash-safety lease**: before calling Stripe we atomically claim the row
 * by setting `payment_status = 'charging'` AND `next_attempt_at = now + 5m`.
 * The UPDATE is conditional on the row still being in a workable state
 * (`awaiting_charge` or `retry_scheduled`) — if another tick already grabbed
 * it, our UPDATE matches zero rows and we return `'skipped'`. The lease
 * window guarantees that if the worker crashes mid-call, the row becomes
 * eligible again on the next cron tick (rather than wedging forever in
 * `'charging'`). The deterministic `stripe_idempotency_key` makes the
 * re-attempt safe — Stripe will replay any prior successful charge instead
 * of duplicating.
 *
 * **Retry ladder** (AC13): attempts 1/2/3 fire at 0h / +12h / +60h from the
 * row's creation. After attempt 1 fails we set `next_attempt_at = now+12h`.
 * After attempt 2 fails we set `next_attempt_at = now+48h`. After attempt 3
 * we flip terminal.
 *
 * **Transient vs decline** (see `isTransientStripeError`): a 5xx-style error
 * is re-queued at `now+1h` WITHOUT incrementing `attempt_count`, because
 * "Stripe is degraded" should not consume one of the buyer's three real
 * attempts at the card.
 *
 * **Skip on auth-probe failure**: if `commitments.payment_error` is non-null
 * (set by the AC12 commit-time probe) we never attempt to charge — we
 * terminal the row with `failed_reason = 'auth_probe_failed'`.
 */
export async function processBagCharge(
  supabase: SupabaseClient,
  chargeRow: BagChargeRow,
  deps: ProcessBagChargeDeps = {}
): Promise<ProcessBagChargeResult> {
  const stripeCharge =
    deps.createAndConfirmPaymentIntent || createAndConfirmPaymentIntent;
  const now = deps.now || (() => new Date());

  // ---------------------------------------------------------------------
  // 1. Claim the row via lease (crash-safe).
  // ---------------------------------------------------------------------
  // Atomic update conditional on the row being in a workable status. If
  // another worker tick already flipped it to 'charging' (or any terminal
  // state) the .in filter rejects it and the UPDATE returns 0 rows. The
  // `next_attempt_at = now + 5m` is the lease — a crashed worker won't
  // wedge the row past this window.
  const leaseExpiry = new Date(now().getTime() + LEASE_WINDOW_MS).toISOString();
  const { data: leased, error: leaseError } = await supabase
    .from("commitment_bag_charges")
    .update({
      payment_status: "charging",
      next_attempt_at: leaseExpiry,
    })
    .eq("id", chargeRow.id)
    // 'charging' included for stale-lease recovery: a worker that crashed
    // mid-Stripe-call left the row in 'charging' with next_attempt_at = its
    // (now-expired) lease. The cron's query already filters by next_attempt_at
    // <= now(), so any 'charging' row reaching this lease grab is stale.
    // The rare two-worker race on a stale lease is safe — Stripe's
    // deterministic idempotency_key deduplicates the underlying charge.
    .in("payment_status", ["awaiting_charge", "retry_scheduled", "charging"])
    .select("id")
    .maybeSingle();

  if (leaseError) {
    // DB-side failure: don't pretend we charged. Surface as skipped so the
    // cron loop can move on; the row stays workable for the next tick.
    return { outcome: "skipped", reason: `lease_error: ${leaseError.message}` };
  }
  if (!leased) {
    // Another worker beat us to it, or the row has already moved to a
    // terminal status. Either way, nothing to do here.
    return { outcome: "skipped", reason: "row_not_workable" };
  }

  // ---------------------------------------------------------------------
  // 2. Look up the commitment to get the saved card + auth-probe signal.
  // ---------------------------------------------------------------------
  // Pulls buyer + lot inline so the AC13 payment-update email (sent on the
  // 1→2 attempt transition from inside `recordDecline`) doesn't need another
  // DB round-trip. Buyer/lot are nullable in the shape because PostgREST can
  // return null embeddeds if the FK row was deleted; the email path
  // tolerates that and just skips the send.
  const { data: commitment, error: commitmentError } = await supabase
    .from("commitments")
    .select(
      "stripe_payment_method_id, stripe_customer_id, charge_currency, payment_error, lot_id, buyer:buyer_id(email, contact_name), lot:lot_id(title)"
    )
    .eq("id", chargeRow.commitment_id)
    .single();

  if (commitmentError || !commitment) {
    // No commitment row means the FK is broken or the commitment was
    // deleted — treat as terminal failure with a clear reason. Won't
    // self-heal on retry.
    return await markPaymentFailed(
      supabase,
      chargeRow,
      `commitment_not_found: ${commitmentError?.message || "unknown"}`,
      now
    );
  }

  // ---------------------------------------------------------------------
  // 3. Auth-probe gate: never charge a card that already failed validation.
  // ---------------------------------------------------------------------
  if (commitment.payment_error) {
    return await markPaymentFailed(
      supabase,
      chargeRow,
      "auth_probe_failed",
      now
    );
  }

  if (!commitment.stripe_payment_method_id || !commitment.stripe_customer_id) {
    return await markPaymentFailed(
      supabase,
      chargeRow,
      "missing_payment_method",
      now
    );
  }

  // Currency falls back to "usd" only if neither commitment nor anything
  // upstream stored it; this is defensive — settlement should always have
  // populated charge_currency.
  const currency = commitment.charge_currency || "usd";

  // ---------------------------------------------------------------------
  // 4. Call Stripe with the row's deterministic idempotency key.
  // ---------------------------------------------------------------------
  let intent: StripePaymentIntent | null = null;
  let stripeErrorMessage: string | null = null;
  try {
    intent = await stripeCharge({
      amountCents: chargeRow.amount_cents,
      currency,
      customerId: commitment.stripe_customer_id,
      paymentMethodId: commitment.stripe_payment_method_id,
      commitmentId: chargeRow.commitment_id,
      lotId: commitment.lot_id,
      idempotencyKey: chargeRow.stripe_idempotency_key,
    });
  } catch (err) {
    stripeErrorMessage =
      err instanceof Error ? err.message : "stripe_unknown_error";
  }

  // ---------------------------------------------------------------------
  // 5a. Success path.
  // ---------------------------------------------------------------------
  if (intent && intent.status === "succeeded") {
    const { error: updateError } = await supabase
      .from("commitment_bag_charges")
      .update({
        payment_status: "charged",
        stripe_payment_intent_id: intent.id,
        attempt_count: chargeRow.attempt_count + 1,
        failed_reason: null,
        next_attempt_at: null,
      })
      .eq("id", chargeRow.id);

    if (updateError) {
      // DB write failed AFTER Stripe succeeded — the next worker tick will
      // see the row stuck in 'charging' with the lease still live, then
      // become workable after the lease expires. The next attempt will
      // hit Stripe's idempotency cache and replay the same successful
      // intent. Surface the error but classify the actual money-side
      // outcome as charged.
      return {
        outcome: "charged",
        reason: `db_update_after_success_failed: ${updateError.message}`,
      };
    }
    // Task 4.11 side-effect. The row just went terminal-`charged`; if it's
    // the last non-terminal sibling for this (lot, bag) the bag is now
    // settled and we should fire the seller + hub transfers. Fire-and-
    // forget: a transfer failure must not block the worker's "I charged
    // the buyer" outcome — the next tick re-evaluates the bag.
    await tryTransferOutBag(supabase, chargeRow);
    // Task 4.13 side-effect. The row just went terminal-`charged`; if it's
    // the last non-terminal sibling for THIS commitment (not the bag — the
    // commitment) we owe the buyer a settlement summary email. The trigger
    // returns `'not_ready'` while any sibling is still in-flight, so most
    // ticks here are no-ops; the LAST tick wins the atomic stamp and sends.
    // Fire-and-forget: a Resend hiccup must not block the "I charged the
    // buyer" outcome.
    await trySendSettlementEmail(supabase, chargeRow.commitment_id);
    return { outcome: "charged" };
  }

  // ---------------------------------------------------------------------
  // 5b. Stripe returned non-success but didn't throw (rare — most failures
  //     throw because lib/stripe.ts unwraps `error.message`). Treat the
  //     status string as the decline code.
  // ---------------------------------------------------------------------
  // Normalize the embedded buyer/lot (PostgREST may return single-object or
  // array shapes depending on the cardinality it infers; coerce defensively).
  const buyer = normalizeEmbed<BuyerForEmail>(
    (commitment as { buyer?: unknown }).buyer
  );
  const lot = normalizeEmbed<LotForEmail>(
    (commitment as { lot?: unknown }).lot
  );

  if (intent && intent.status !== "succeeded") {
    return await recordDecline(
      supabase,
      chargeRow,
      intent.status || "non_succeeded_status",
      now,
      buyer,
      lot
    );
  }

  // ---------------------------------------------------------------------
  // 5c. Threw — decide transient vs real decline.
  // ---------------------------------------------------------------------
  if (stripeErrorMessage && isTransientStripeError(stripeErrorMessage)) {
    return await requeueTransient(
      supabase,
      chargeRow,
      stripeErrorMessage,
      now
    );
  }

  return await recordDecline(
    supabase,
    chargeRow,
    stripeErrorMessage || "stripe_unknown_error",
    now,
    buyer,
    lot
  );
}

/**
 * PostgREST embedded-select shapes can come back as a single object or a
 * one-element array depending on how it resolves the relationship. Normalize
 * to "first object or null" so callers don't have to branch.
 */
function normalizeEmbed<T>(value: unknown): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return (value[0] as T) ?? null;
  return value as T;
}

// -------------------------------------------------------------------------
// State-transition helpers (all keep the row's lease released via update).
// -------------------------------------------------------------------------

/**
 * Decline path. Increments `attempt_count` and either schedules the next
 * retry per the ladder (12h after attempt 1, 48h after attempt 2) or flips
 * the row terminal `payment_failed` after attempt 3.
 *
 * AC13 side-effect: when the new attempt count transitions from 1 to 2 (i.e.
 * THIS call is the second decline, with one more retry queued ~48h out) and
 * `payment_update_email_sent_at` is still NULL on the row, send the buyer
 * the "update your card" email and stamp the timestamp in the same UPDATE.
 * Email send is best-effort — a Resend failure must not block the row's
 * state transition (the retry can still go through if the buyer happens to
 * update the card via another channel).
 */
async function recordDecline(
  supabase: SupabaseClient,
  chargeRow: BagChargeRow,
  reason: string,
  now: () => Date,
  buyer: BuyerForEmail | null,
  lot: LotForEmail | null
): Promise<ProcessBagChargeResult> {
  const newAttemptCount = chargeRow.attempt_count + 1;

  if (newAttemptCount >= MAX_ATTEMPTS) {
    return await markPaymentFailed(supabase, chargeRow, reason, now, {
      attemptCountOverride: newAttemptCount,
    });
  }

  // Attempt 1 just failed → +12h. Attempt 2 just failed → +48h.
  // (newAttemptCount is the count INCLUDING the attempt that just failed.)
  const delayMs =
    newAttemptCount === 1
      ? RETRY_DELAY_AFTER_ATTEMPT_1_MS
      : RETRY_DELAY_AFTER_ATTEMPT_2_MS;
  const nextAttempt = new Date(now().getTime() + delayMs).toISOString();

  // AC13 payment-update email gate: only on the 1→2 transition, only if the
  // row has not already been emailed for this commitment. Idempotent across
  // re-runs because the stamp is persisted in the same UPDATE below.
  const shouldSendPaymentUpdateEmail =
    newAttemptCount === 2 && chargeRow.payment_update_email_sent_at === null;

  if (shouldSendPaymentUpdateEmail && buyer?.email && lot) {
    try {
      await sendPaymentUpdateRequiredEmail({
        buyer: { email: buyer.email, contact_name: buyer.contact_name },
        lotTitle: lot.title,
        commitmentId: chargeRow.commitment_id,
        reason,
        manageUrl: `${APP_URL}/dashboard/buyer/commitments/${chargeRow.commitment_id}`,
      });
    } catch (emailErr) {
      // Resend hiccup must not block the row transition — the retry ladder
      // is the source of truth, the email is a courtesy.
      console.warn(
        "[charge-worker] failed to send payment-update-required email",
        emailErr instanceof Error ? emailErr.message : emailErr
      );
    }
  }

  const updatePayload: Record<string, unknown> = {
    payment_status: "retry_scheduled",
    attempt_count: newAttemptCount,
    failed_reason: reason,
    next_attempt_at: nextAttempt,
  };
  if (shouldSendPaymentUpdateEmail) {
    // Stamp regardless of whether the Resend call above succeeded — we don't
    // want a retry of THIS row to spam the buyer with a second email just
    // because the first one's HTTP call failed. The buyer dashboard surfaces
    // the same "update your card" CTA, so the email is recoverable in the UI.
    updatePayload.payment_update_email_sent_at = now().toISOString();
  }

  const { error: updateError } = await supabase
    .from("commitment_bag_charges")
    .update(updatePayload)
    .eq("id", chargeRow.id);

  if (updateError) {
    // Lease will expire and the row will be re-picked-up. Surface but don't
    // re-throw — the next tick handles it.
    return {
      outcome: "retry_scheduled",
      reason: `db_update_failed: ${updateError.message}`,
    };
  }
  return { outcome: "retry_scheduled", reason };
}

/**
 * Transient-error path. Does NOT increment `attempt_count` — Stripe being
 * degraded must not consume one of the buyer's three real card attempts.
 * Re-queues for +1h.
 */
async function requeueTransient(
  supabase: SupabaseClient,
  chargeRow: BagChargeRow,
  reason: string,
  now: () => Date
): Promise<ProcessBagChargeResult> {
  const nextAttempt = new Date(
    now().getTime() + TRANSIENT_REQUEUE_DELAY_MS
  ).toISOString();

  const { error: updateError } = await supabase
    .from("commitment_bag_charges")
    .update({
      payment_status: "retry_scheduled",
      // attempt_count UNCHANGED — transient errors are free retries.
      failed_reason: reason,
      next_attempt_at: nextAttempt,
    })
    .eq("id", chargeRow.id);

  if (updateError) {
    return {
      outcome: "retry_scheduled",
      reason: `db_update_failed: ${updateError.message}`,
    };
  }
  return { outcome: "retry_scheduled", reason: `transient: ${reason}` };
}

/**
 * Terminal-failure path. `next_attempt_at = NULL` so the row is no longer
 * eligible for the worker queue; it'll surface on the ops dashboard
 * (Task 4.10) for manual remediation.
 */
async function markPaymentFailed(
  supabase: SupabaseClient,
  chargeRow: BagChargeRow,
  reason: string,
  _now: () => Date,
  opts: { attemptCountOverride?: number } = {}
): Promise<ProcessBagChargeResult> {
  const attemptCount =
    opts.attemptCountOverride !== undefined
      ? opts.attemptCountOverride
      : chargeRow.attempt_count;

  const { error: updateError } = await supabase
    .from("commitment_bag_charges")
    .update({
      payment_status: "payment_failed",
      attempt_count: attemptCount,
      failed_reason: reason,
      next_attempt_at: null,
    })
    .eq("id", chargeRow.id);

  if (updateError) {
    return {
      outcome: "payment_failed",
      reason: `db_update_failed: ${updateError.message}`,
    };
  }
  // Task 4.11 side-effect. A terminal `payment_failed` row can complete the
  // bag just as `charged` does: if every sibling is terminal, the bag's
  // settled-revenue is locked (failed rows just don't contribute). Fire-
  // and-forget; failures inside the transfer-out are logged, not thrown.
  await tryTransferOutBag(supabase, chargeRow);
  // Task 4.13 side-effect. A terminal `payment_failed` row is also a
  // commitment-settlement candidate — if every sibling row for this
  // commitment is terminal we send the buyer their summary (with the
  // failed bag row shown as "Payment failed" so they see exactly what
  // happened to which bag). Fire-and-forget mirrors the transfer-out
  // call above.
  await trySendSettlementEmail(supabase, chargeRow.commitment_id);
  return { outcome: "payment_failed", reason };
}

/**
 * Fire-and-forget wrapper around `transferOutBagIfReady`. Wraps every
 * possible failure mode (DB error, Stripe error, JS exception) in a
 * try/catch + warn so the worker's main outcome (charged / payment_failed)
 * is never blocked by a downstream transfer hiccup. The transfer-out
 * function itself is idempotent, so the NEXT tick that lands a terminal
 * row in the same bag will re-run this — eventual consistency.
 */
async function tryTransferOutBag(
  supabase: SupabaseClient,
  chargeRow: BagChargeRow
): Promise<void> {
  try {
    const result = await transferOutBagIfReady(supabase, {
      commitmentId: chargeRow.commitment_id,
      bagNumber: chargeRow.bag_number,
    });
    if (result.status === "skipped" && result.reason) {
      // Skipped-with-reason is the "we tried but couldn't" path (missing
      // Stripe account, sibling lookup failure, etc.). Worth a warn so the
      // ops dashboard / log inspector can surface it.
      console.warn(
        "[charge-worker] transferOutBagIfReady skipped",
        {
          commitmentId: chargeRow.commitment_id,
          bagNumber: chargeRow.bag_number,
          reason: result.reason,
        }
      );
    }
  } catch (err) {
    console.warn(
      "[charge-worker] transferOutBagIfReady threw",
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Fire-and-forget wrapper around `sendSettlementEmailIfReady`. Same shape as
 * `tryTransferOutBag` above — the trigger function itself never throws by
 * contract, but we double-wrap in try/catch so an unexpected JS exception
 * (e.g. a future refactor that violates the never-throw invariant) cannot
 * propagate out of the worker and abort the per-row processing loop.
 *
 * `'not_ready'` is the common case (most ticks land while siblings are still
 * in-flight) — we don't warn on it. `'already_sent'` is also a clean no-op.
 * Only `'skipped'`-with-reason warrants surfacing.
 */
async function trySendSettlementEmail(
  supabase: SupabaseClient,
  commitmentId: string
): Promise<void> {
  try {
    const result = await sendSettlementEmailIfReady(supabase, commitmentId);
    if (result.status === "skipped" && result.reason) {
      console.warn("[charge-worker] sendSettlementEmailIfReady skipped", {
        commitmentId,
        reason: result.reason,
      });
    }
  } catch (err) {
    console.warn(
      "[charge-worker] sendSettlementEmailIfReady threw",
      err instanceof Error ? err.message : err
    );
  }
}

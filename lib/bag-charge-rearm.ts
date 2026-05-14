/**
 * Bag-aware charge re-arm.
 *
 * Fired from the Stripe-webhook setup-mode handlers when a buyer completes
 * a fresh Stripe Checkout setup session attached to an existing commitment
 * with at least one terminal `payment_failed` bag row. Flips those rows
 * back to `awaiting_charge` with a fresh idempotency key so the charge
 * worker picks them up on the next tick using the buyer's newly-attached
 * payment method.
 *
 * Idempotency:
 * - Reading `payment_status = 'payment_failed'` and updating with the same
 *   WHERE clause means a second webhook delivery is a guaranteed no-op:
 *   the first delivery flipped the row to `awaiting_charge`, the second
 *   delivery's WHERE clause excludes it.
 * - The new `stripe_idempotency_key` is derived from the new setup_intent
 *   id so Stripe webhook retries reuse the same key (no UNIQUE collision)
 *   but a separate restart-setup flow produces a different key (which is
 *   what we want — the previous key is stuck in Stripe's idempotency cache
 *   pointing at the failed PaymentIntent and would replay the decline).
 *
 * Race with the worker:
 * - The worker uses a 5-minute lease (`payment_status = 'charging'`).
 * - Re-arm scopes its UPDATE by `payment_status = 'payment_failed'`, so a
 *   row already claimed by a concurrent worker tick is left alone.
 * - The worker only flips a row to `charging` from `awaiting_charge` /
 *   `retry_scheduled` / `charging` (lease re-claim), so it cannot move a
 *   `payment_failed` row into `charging` without the re-arm running
 *   first.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface RearmFailedBagChargesArgs {
  commitmentId: string;
  /**
   * The new setup_intent id from the buyer's just-completed Checkout
   * setup session. Used as the suffix on the row's `stripe_idempotency_key`
   * so the worker's next Stripe call doesn't hit a cached failed outcome.
   */
  newSetupIntentId: string;
}

export interface RearmFailedBagChargesResult {
  status: "rearmed" | "no_failed_rows";
  /** Ids of rows the UPDATE actually changed. Useful for tests + logs. */
  rearmedRowIds: string[];
}

export async function rearmFailedBagCharges(
  supabase: SupabaseClient,
  args: RearmFailedBagChargesArgs
): Promise<RearmFailedBagChargesResult> {
  const { data: failed, error: readError } = await supabase
    .from("commitment_bag_charges")
    .select("id, bag_number")
    .eq("commitment_id", args.commitmentId)
    .eq("payment_status", "payment_failed");

  if (readError) {
    throw new Error(
      `rearmFailedBagCharges read failed: ${readError.message}`
    );
  }
  if (!failed || failed.length === 0) {
    return { status: "no_failed_rows", rearmedRowIds: [] };
  }

  const rearmedRowIds: string[] = [];
  for (const row of failed as Array<{ id: string; bag_number: number }>) {
    const { error: updateError } = await supabase
      .from("commitment_bag_charges")
      .update({
        payment_status: "awaiting_charge",
        attempt_count: 0,
        failed_reason: null,
        next_attempt_at: null,
        stripe_payment_intent_id: null,
        stripe_idempotency_key: `retry:${args.newSetupIntentId}:bag:${row.bag_number}`,
        // AC13 idempotency stamp — clearing lets the worker re-send the
        // "card declined" email on a fresh failure with the new card.
        payment_update_email_sent_at: null,
      })
      .eq("id", row.id)
      // Defensive scope: only flip rows that are still `payment_failed`.
      // Prevents a race with the charge worker (which might have already
      // claimed the row from a parallel path) or with a concurrent
      // re-arm call from a duplicate webhook delivery.
      .eq("payment_status", "payment_failed");
    if (!updateError) rearmedRowIds.push(row.id);
  }

  return {
    status: rearmedRowIds.length > 0 ? "rearmed" : "no_failed_rows",
    rearmedRowIds,
  };
}

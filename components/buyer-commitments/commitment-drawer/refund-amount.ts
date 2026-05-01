import type { Commitment } from "@/lib/types";

/**
 * Returns the refund amount in dollars for a single commitment, handling the
 * three ways a refund can be reflected in the data:
 *
 * 1. **Cron-triggered min-not-met refund** — `app/api/payments/settle-deadlines`
 *    flips `payment_status` to `cancelled` and writes a `payment_error` that
 *    starts with `"Refunded:"`, but does NOT touch `refunded_amount_cents`.
 *    Use `total_price` as the refund amount in this case (the buyer got back
 *    exactly what they were going to be charged).
 *
 * 2. **Stripe-managed refund on a still-succeeded commitment** —
 *    `charge_amount_cents` is already net of refunds (per the Stripe webhook
 *    that updates it). Refund = `total_price − charge_amount_cents`.
 *
 * 3. **Admin manual refund** — `app/api/admin/refunds/route.ts` writes
 *    `refunded_amount_cents` directly. Use it when present.
 *
 * Pick the largest of the candidates so we never double-count when paths
 * overlap (e.g. an admin refund tracked AND charge_amount_cents already
 * reduced by Stripe).
 */
export function refundDollarsFor(c: Commitment): number {
  const billed = Number(c.total_price || 0);

  // Path 1: cron-triggered cancellation after a successful charge
  const cronRefund =
    c.payment_status === "cancelled" && c.stripe_payment_intent_id
      ? billed
      : 0;

  // Path 2: Stripe netted charge_amount_cents on partial/full refund
  const stripeRefund =
    c.payment_status === "charge_succeeded" && c.charge_amount_cents != null
      ? Math.max(0, billed - c.charge_amount_cents / 100)
      : 0;

  // Path 3: admin manual-refund column
  const trackedRefund = Number(c.refunded_amount_cents || 0) / 100;

  return Math.max(cronRefund, stripeRefund, trackedRefund);
}

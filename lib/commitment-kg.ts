import type { Commitment } from "@/lib/types";

/**
 * Effective kg for "this is my commitment" displays — the unit-side analog
 * of "what was agreed to."
 *
 * Pre-settlement (campaign still active or just past deadline): the buyer's
 * pledged `quantity_kg`. They wanted N kg, they pledged for N kg.
 *
 * Post-settlement (bag-aware): `kg_locked_at_settlement`, the actual weight
 * allocated to bags for this commit. Bag-aware allocation rounds down to a
 * whole multiple of `bag_size_kg`, so the locked amount is always ≤ the
 * pledge. The leftover (`quantity_kg − kg_locked_at_settlement`) is the
 * fractional bag that didn't fill — those kg never ship and were never
 * charged.
 *
 * For charged-vs-failed accounting (Landing Soon / YTD Spend / etc.), use
 * `effectiveChargedKg` in `bucket-by-lifecycle.ts` instead — that sums the
 * `charged` bag rows, which can be less than the locked amount when some
 * bags failed.
 */
export function commitmentDisplayKg(
  c: Pick<Commitment, "quantity_kg" | "kg_locked_at_settlement">
): number {
  const locked = c.kg_locked_at_settlement;
  if (locked != null && Number(locked) > 0) return Number(locked);
  return Number(c.quantity_kg || 0);
}

/**
 * Sum of `commitmentDisplayKg` across a list. Handy for the seller's
 * "total settled" line and the buyer's per-group totals.
 */
export function totalCommitmentDisplayKg(
  commitments: Array<Pick<Commitment, "quantity_kg" | "kg_locked_at_settlement">>
): number {
  return commitments.reduce((sum, c) => sum + commitmentDisplayKg(c), 0);
}

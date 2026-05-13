/**
 * Pure helpers for bag-aware campaign settlement pricing.
 *
 * The legacy settlement codepath in `app/api/payments/settle-deadlines/route.ts`
 * resolves the final per-kg tier price by total committed *kg* via
 * `getFinalPricePerKg`. Under the bag-aware model (spec AC4, AC6), settlement
 * resolves the price by *completed bag count* — the largest tier whose
 * `min_bags` is ≤ `floor(total_committed_kg / bag_size_kg)`.
 *
 * This module is the math foundation that downstream tasks (per-bag charge
 * row creation, fee splits, charge worker) consume. It is intentionally
 * I/O-free and does not depend on Date — every input is supplied by the
 * caller so callers can unit-test the surrounding settlement flow without
 * spinning up the worker.
 *
 * Callers MUST only invoke this for bag-aware lots (`lot.bag_size_kg !== null`).
 * Legacy kg-tier lots continue to use `getFinalPricePerKg` in the route file.
 */

/** A pricing tier as the bag-aware model sees it. */
export type BagPricingTier = {
  /**
   * Minimum completed bag count for this tier to apply. `null` indicates a
   * legacy unconverted tier (still keyed on `min_quantity_kg`); such tiers
   * are excluded from bag-aware resolution.
   */
  min_bags: number | null;
  /** Tier price in the lot's currency, per kg. */
  price_per_kg: number;
};

/** Input to `computeCompletedBagsAndPrice`. */
export type ComputeCompletedBagsAndPriceInput = {
  /** Sum of every commitment's `quantity_kg` on the campaign at settlement. */
  total_committed_kg: number;
  /** The lot's bag size in kg. Must be > 0. */
  bag_size_kg: number;
  /** The lot's base (no-tier) price per kg. */
  base_price_per_kg: number;
  /** All pricing tiers loaded for the lot. Order does not matter. */
  tiers: BagPricingTier[];
};

/** Result of `computeCompletedBagsAndPrice`. */
export type ComputeCompletedBagsAndPriceResult = {
  /** `floor(total_committed_kg / bag_size_kg)`. Zero for empty / sub-bag totals. */
  completed_bags: number;
  /** The resolved per-kg price after tier lookup. Falls back to base. */
  price_per_kg: number;
  /**
   * The tier whose `min_bags` was selected. `null` when no tier applied —
   * either because no tiers were defined, all tiers' `min_bags` exceed
   * `completed_bags`, or every tier was legacy-unconverted (`min_bags = null`).
   */
  tier_applied: { min_bags: number; price_per_kg: number } | null;
};

/**
 * Resolve completed bag count and the tier price that should apply at
 * settlement for a bag-aware lot.
 *
 * Algorithm:
 *   1. `completed_bags = floor(total_committed_kg / bag_size_kg)`.
 *   2. Filter tiers to those with `min_bags !== null` (drop legacy ones).
 *   3. Among the remaining tiers, find the one with the LARGEST `min_bags`
 *      that is still ≤ `completed_bags`. That tier wins.
 *   4. If no tier qualifies, return `base_price_per_kg` with `tier_applied = null`.
 *
 * The function is pure: same inputs → same outputs. It does not mutate
 * `input.tiers`. It does not assume tiers are sorted.
 */
export function computeCompletedBagsAndPrice(
  input: ComputeCompletedBagsAndPriceInput
): ComputeCompletedBagsAndPriceResult {
  const { total_committed_kg, bag_size_kg, base_price_per_kg, tiers } = input;

  if (!Number.isFinite(bag_size_kg) || bag_size_kg <= 0) {
    throw new Error(
      `computeCompletedBagsAndPrice: bag_size_kg must be a positive number, got ${bag_size_kg}`
    );
  }
  if (!Number.isFinite(total_committed_kg) || total_committed_kg < 0) {
    throw new Error(
      `computeCompletedBagsAndPrice: total_committed_kg must be a non-negative number, got ${total_committed_kg}`
    );
  }
  if (!Number.isFinite(base_price_per_kg) || base_price_per_kg < 0) {
    throw new Error(
      `computeCompletedBagsAndPrice: base_price_per_kg must be a non-negative number, got ${base_price_per_kg}`
    );
  }

  const completed_bags = Math.floor(total_committed_kg / bag_size_kg);

  // Drop legacy unconverted tiers; they can't be reasoned about in bag space.
  // Among the remainder, pick the largest min_bags ≤ completed_bags. Walking
  // a filtered copy keeps the algorithm correct even if the caller passes
  // tiers in arbitrary order.
  let applied: { min_bags: number; price_per_kg: number } | null = null;
  for (const tier of tiers) {
    if (tier.min_bags === null) continue;
    if (tier.min_bags > completed_bags) continue;
    if (applied === null || tier.min_bags > applied.min_bags) {
      applied = { min_bags: tier.min_bags, price_per_kg: tier.price_per_kg };
    }
  }

  return {
    completed_bags,
    price_per_kg: applied ? applied.price_per_kg : base_price_per_kg,
    tier_applied: applied,
  };
}

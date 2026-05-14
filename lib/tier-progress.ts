/**
 * Shared bag-aware volume tier progress helper.
 *
 * Under the bag-aware model, a pricing tier unlocks when
 *   completed_bags = floor(total_committed_kg / bag_size_kg)
 * reaches the tier's `min_bags`. This module centralises the math so every
 * buyer, seller, and hub surface resolves "current tier" and "next tier" the
 * same way, without each page re-implementing the comparison.
 *
 * Bag-aware vs. legacy:
 *  - A lot is "bag-aware" when `bag_size_kg > 0` AND at least one tier has
 *    `min_bags !== null`. We then resolve tiers by bag count.
 *  - Otherwise we fall back to legacy weight-based resolution against
 *    `min_quantity_kg`. This covers lots that haven't been backfilled yet.
 *
 * The settlement code path in `lib/settle-bag-pricing.ts` is the authoritative
 * pricing oracle at deadline; this module mirrors its tier-selection rule for
 * read-only display purposes.
 */

export type TierInput = {
  min_bags: number | null;
  min_quantity_kg: number | null;
  price_per_kg: number;
};

export type LotInput = {
  committed_quantity_kg: number;
  price_per_kg: number;
  bag_size_kg: number | null;
};

/** A tier normalised so callers can read either `min_bags` or `threshold_kg`. */
export type ResolvedTier = {
  /** For bag-aware lots: tier.min_bags. For legacy lots: undefined. */
  min_bags: number | null;
  /** Weight equivalent. Always set so progress bars can position markers. */
  threshold_kg: number;
  price_per_kg: number;
};

export type TierProgress = {
  /** The lot's bag size in kg, or null when not bag-configured. */
  bagSize: number | null;
  /**
   * True when the lot has `bag_size_kg > 0` and at least one tier carries a
   * non-null `min_bags`. UI should use bag-flavoured copy in this case.
   */
  isBagAware: boolean;
  /** Whole completed bags. Zero for legacy lots or sub-bag totals. */
  completedBags: number;
  /** Echo of the lot's committed kg, coerced to Number. */
  committedKg: number;
  /** Ascending by threshold. Legacy and bag-aware tiers are normalised. */
  sortedTiers: ResolvedTier[];
  /** Highest qualifying tier, or null when none reached. */
  currentTier: ResolvedTier | null;
  /** Resolved per-kg price: current tier price, or the lot's base price. */
  currentPricePerKg: number;
  /** Next tier above current, or null when the top tier is already unlocked. */
  nextTier: ResolvedTier | null;
  /** Bags remaining until `nextTier` unlocks. Zero when not bag-aware or none. */
  bagsToNext: number;
  /** Kg remaining until `nextTier` unlocks. Useful for both modes. */
  kgToNext: number;
};

/**
 * Compute completed bag count. Returns 0 when the lot has no bag size or
 * committed quantity is non-positive.
 */
export function getCompletedBags(
  committedKg: number,
  bagSizeKg: number | null
): number {
  if (!bagSizeKg || bagSizeKg <= 0) return 0;
  if (!Number.isFinite(committedKg) || committedKg <= 0) return 0;
  return Math.floor(committedKg / bagSizeKg);
}

/**
 * Resolve a single tier into the normalised `ResolvedTier` shape. Returns
 * null when neither bag nor kg threshold is usable for this lot.
 */
function resolveTier(tier: TierInput, bagSizeKg: number | null): ResolvedTier | null {
  if (tier.min_bags !== null && bagSizeKg && bagSizeKg > 0) {
    return {
      min_bags: tier.min_bags,
      threshold_kg: tier.min_bags * bagSizeKg,
      price_per_kg: Number(tier.price_per_kg),
    };
  }
  if (tier.min_quantity_kg !== null && tier.min_quantity_kg !== undefined) {
    return {
      min_bags: null,
      threshold_kg: Number(tier.min_quantity_kg),
      price_per_kg: Number(tier.price_per_kg),
    };
  }
  return null;
}

/**
 * Single entry point for tier progress on a lot. Pure: no I/O, no mutation
 * of the input tier array.
 */
export function getTierProgress(lot: LotInput, tiers: TierInput[]): TierProgress {
  const bagSize = lot.bag_size_kg && lot.bag_size_kg > 0 ? Number(lot.bag_size_kg) : null;
  const committedKg = Number(lot.committed_quantity_kg) || 0;
  const completedBags = getCompletedBags(committedKg, bagSize);
  const basePricePerKg = Number(lot.price_per_kg);

  const isBagAware = bagSize !== null && tiers.some((t) => t.min_bags !== null);

  const resolved: ResolvedTier[] = [];
  for (const t of tiers) {
    const r = resolveTier(t, bagSize);
    if (r !== null) resolved.push(r);
  }
  const sortedTiers = resolved.sort((a, b) => a.threshold_kg - b.threshold_kg);

  let currentTier: ResolvedTier | null = null;
  let nextTier: ResolvedTier | null = null;

  if (isBagAware) {
    for (const t of sortedTiers) {
      if (t.min_bags === null) continue;
      if (t.min_bags <= completedBags) {
        currentTier = t;
      } else if (nextTier === null) {
        nextTier = t;
        break;
      }
    }
  } else {
    for (const t of sortedTiers) {
      if (t.threshold_kg <= committedKg) {
        currentTier = t;
      } else if (nextTier === null) {
        nextTier = t;
        break;
      }
    }
  }

  const currentPricePerKg = currentTier ? currentTier.price_per_kg : basePricePerKg;

  let bagsToNext = 0;
  let kgToNext = 0;
  if (nextTier) {
    if (isBagAware && nextTier.min_bags !== null && bagSize) {
      bagsToNext = Math.max(0, nextTier.min_bags - completedBags);
      kgToNext = Math.max(0, nextTier.threshold_kg - committedKg);
    } else {
      kgToNext = Math.max(0, nextTier.threshold_kg - committedKg);
    }
  }

  return {
    bagSize,
    isBagAware,
    completedBags,
    committedKg,
    sortedTiers,
    currentTier,
    currentPricePerKg,
    nextTier,
    bagsToNext,
    kgToNext,
  };
}

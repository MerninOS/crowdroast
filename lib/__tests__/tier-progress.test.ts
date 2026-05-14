import { describe, it, expect } from "vitest";
import {
  getCompletedBags,
  getTierProgress,
  type TierInput,
} from "@/lib/tier-progress";

describe("getCompletedBags", () => {
  it("floors committed kg by bag size", () => {
    expect(getCompletedBags(187, 60)).toBe(3);
    expect(getCompletedBags(180, 60)).toBe(3);
    expect(getCompletedBags(59, 60)).toBe(0);
  });

  it("returns 0 when bag size is missing or zero", () => {
    expect(getCompletedBags(187, null)).toBe(0);
    expect(getCompletedBags(187, 0)).toBe(0);
  });

  it("returns 0 for non-positive committed kg", () => {
    expect(getCompletedBags(0, 60)).toBe(0);
    expect(getCompletedBags(-5, 60)).toBe(0);
  });
});

describe("getTierProgress (bag-aware)", () => {
  const tiers: TierInput[] = [
    { min_bags: 1, min_quantity_kg: null, price_per_kg: 10 },
    { min_bags: 3, min_quantity_kg: null, price_per_kg: 9 },
    { min_bags: 6, min_quantity_kg: null, price_per_kg: 8.5 },
  ];

  it("resolves the largest qualifying tier by bag count", () => {
    const p = getTierProgress(
      { committed_quantity_kg: 187, price_per_kg: 11, bag_size_kg: 60 },
      tiers
    );
    expect(p.isBagAware).toBe(true);
    expect(p.completedBags).toBe(3);
    expect(p.currentPricePerKg).toBe(9);
    expect(p.currentTier?.min_bags).toBe(3);
    expect(p.nextTier?.min_bags).toBe(6);
    expect(p.bagsToNext).toBe(3);
    expect(p.kgToNext).toBe(60 * 6 - 187);
  });

  it("falls back to base price when no tier qualifies", () => {
    const p = getTierProgress(
      { committed_quantity_kg: 30, price_per_kg: 11, bag_size_kg: 60 },
      tiers
    );
    expect(p.completedBags).toBe(0);
    expect(p.currentTier).toBeNull();
    expect(p.currentPricePerKg).toBe(11);
    expect(p.nextTier?.min_bags).toBe(1);
    expect(p.bagsToNext).toBe(1);
  });

  it("returns null nextTier when top tier already unlocked", () => {
    const p = getTierProgress(
      { committed_quantity_kg: 600, price_per_kg: 11, bag_size_kg: 60 },
      tiers
    );
    expect(p.completedBags).toBe(10);
    expect(p.currentTier?.min_bags).toBe(6);
    expect(p.nextTier).toBeNull();
    expect(p.bagsToNext).toBe(0);
  });

  it("sorts unordered tier input", () => {
    const unordered: TierInput[] = [
      { min_bags: 6, min_quantity_kg: null, price_per_kg: 8.5 },
      { min_bags: 1, min_quantity_kg: null, price_per_kg: 10 },
      { min_bags: 3, min_quantity_kg: null, price_per_kg: 9 },
    ];
    const p = getTierProgress(
      { committed_quantity_kg: 187, price_per_kg: 11, bag_size_kg: 60 },
      unordered
    );
    expect(p.sortedTiers.map((t) => t.min_bags)).toEqual([1, 3, 6]);
  });
});

describe("getTierProgress (legacy weight-based)", () => {
  const tiers: TierInput[] = [
    { min_bags: null, min_quantity_kg: 50, price_per_kg: 10 },
    { min_bags: null, min_quantity_kg: 150, price_per_kg: 9 },
    { min_bags: null, min_quantity_kg: 300, price_per_kg: 8 },
  ];

  it("uses kg comparison when no bag config present", () => {
    const p = getTierProgress(
      { committed_quantity_kg: 200, price_per_kg: 11, bag_size_kg: null },
      tiers
    );
    expect(p.isBagAware).toBe(false);
    expect(p.completedBags).toBe(0);
    expect(p.currentTier?.threshold_kg).toBe(150);
    expect(p.currentPricePerKg).toBe(9);
    expect(p.nextTier?.threshold_kg).toBe(300);
    expect(p.kgToNext).toBe(100);
    expect(p.bagsToNext).toBe(0);
  });

  it("uses kg comparison when bag_size present but tiers are unconverted", () => {
    const p = getTierProgress(
      { committed_quantity_kg: 200, price_per_kg: 11, bag_size_kg: 60 },
      tiers
    );
    expect(p.isBagAware).toBe(false);
    expect(p.currentTier?.threshold_kg).toBe(150);
  });
});

describe("getTierProgress (mixed)", () => {
  it("prefers bag-aware path when any tier is converted, dropping legacy tiers", () => {
    const mixed: TierInput[] = [
      { min_bags: null, min_quantity_kg: 50, price_per_kg: 10 },
      { min_bags: 3, min_quantity_kg: null, price_per_kg: 9 },
    ];
    const p = getTierProgress(
      { committed_quantity_kg: 180, price_per_kg: 11, bag_size_kg: 60 },
      mixed
    );
    expect(p.isBagAware).toBe(true);
    expect(p.completedBags).toBe(3);
    expect(p.currentTier?.min_bags).toBe(3);
    expect(p.currentPricePerKg).toBe(9);
  });
});

describe("getTierProgress (empty)", () => {
  it("returns base price with no tiers", () => {
    const p = getTierProgress(
      { committed_quantity_kg: 100, price_per_kg: 11, bag_size_kg: 60 },
      []
    );
    expect(p.sortedTiers).toEqual([]);
    expect(p.currentTier).toBeNull();
    expect(p.currentPricePerKg).toBe(11);
    expect(p.nextTier).toBeNull();
  });
});

/**
 * Pure unit tests for `computeCompletedBagsAndPrice` (lib/settle-bag-pricing.ts).
 *
 * Plan task 4.4 (bag-aware-campaign-close). The function is pure and
 * deterministic — no mocks. Boundary cases mirror the plan's verification
 * spec plus a few defensive checks (input validation, order independence).
 */

import { describe, it, expect } from "vitest";
import {
  computeCompletedBagsAndPrice,
  type BagPricingTier,
} from "@/lib/settle-bag-pricing";

describe("computeCompletedBagsAndPrice", () => {
  // ---------------------------------------------------------------------------
  // Core happy path from the plan: 187kg / 60kg bag / tiers (1→10, 3→9, 6→8.50)
  // / base $10 → 3 bags, $9/kg, tier {3, 9} applied.
  // ---------------------------------------------------------------------------
  it("resolves the largest qualifying tier (plan example: 187kg / 60kg / 3-bag tier wins)", () => {
    const tiers: BagPricingTier[] = [
      { min_bags: 1, price_per_kg: 10 },
      { min_bags: 3, price_per_kg: 9 },
      { min_bags: 6, price_per_kg: 8.5 },
    ];
    const result = computeCompletedBagsAndPrice({
      total_committed_kg: 187,
      bag_size_kg: 60,
      base_price_per_kg: 10,
      tiers,
    });

    expect(result.completed_bags).toBe(3);
    expect(result.price_per_kg).toBe(9);
    expect(result.tier_applied).toEqual({ min_bags: 3, price_per_kg: 9 });
  });

  // ---------------------------------------------------------------------------
  // Zero kg → no bags, base price falls through.
  // ---------------------------------------------------------------------------
  it("returns zero bags and base price for an empty campaign", () => {
    const result = computeCompletedBagsAndPrice({
      total_committed_kg: 0,
      bag_size_kg: 60,
      base_price_per_kg: 10,
      tiers: [{ min_bags: 1, price_per_kg: 9 }],
    });

    expect(result.completed_bags).toBe(0);
    expect(result.price_per_kg).toBe(10);
    expect(result.tier_applied).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Exact bag multiple → no floating-point overflow into one more bag.
  // 180 / 60 = 3 exactly; the 3-bag tier must still apply.
  // ---------------------------------------------------------------------------
  it("handles exact bag multiples without overshoot (180kg / 60kg → 3 bags)", () => {
    const result = computeCompletedBagsAndPrice({
      total_committed_kg: 180,
      bag_size_kg: 60,
      base_price_per_kg: 10,
      tiers: [
        { min_bags: 1, price_per_kg: 10 },
        { min_bags: 3, price_per_kg: 9 },
        { min_bags: 6, price_per_kg: 8.5 },
      ],
    });

    expect(result.completed_bags).toBe(3);
    expect(result.price_per_kg).toBe(9);
    expect(result.tier_applied).toEqual({ min_bags: 3, price_per_kg: 9 });
  });

  // ---------------------------------------------------------------------------
  // No tiers defined at all → base price applied.
  // ---------------------------------------------------------------------------
  it("falls back to base price when no tiers are defined", () => {
    const result = computeCompletedBagsAndPrice({
      total_committed_kg: 600,
      bag_size_kg: 60,
      base_price_per_kg: 12.5,
      tiers: [],
    });

    expect(result.completed_bags).toBe(10);
    expect(result.price_per_kg).toBe(12.5);
    expect(result.tier_applied).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // All tiers are legacy-unconverted (min_bags = null). They MUST be ignored;
  // base price applies. This is the cutover safety net while pricing_tiers
  // still has min_quantity_kg-only rows.
  // ---------------------------------------------------------------------------
  it("ignores legacy unconverted tiers (min_bags = null) and applies base", () => {
    const tiers: BagPricingTier[] = [
      { min_bags: null, price_per_kg: 9 },
      { min_bags: null, price_per_kg: 8.5 },
    ];
    const result = computeCompletedBagsAndPrice({
      total_committed_kg: 600,
      bag_size_kg: 60,
      base_price_per_kg: 10,
      tiers,
    });

    expect(result.completed_bags).toBe(10);
    expect(result.price_per_kg).toBe(10);
    expect(result.tier_applied).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Tiers in arbitrary order — must still pick the largest qualifying min_bags.
  // ---------------------------------------------------------------------------
  it("picks the correct tier regardless of tier order (input unsorted)", () => {
    const tiers: BagPricingTier[] = [
      { min_bags: 6, price_per_kg: 8.5 },
      { min_bags: 1, price_per_kg: 10 },
      { min_bags: 3, price_per_kg: 9 },
    ];
    const result = computeCompletedBagsAndPrice({
      total_committed_kg: 240, // 4 bags
      bag_size_kg: 60,
      base_price_per_kg: 11,
      tiers,
    });

    expect(result.completed_bags).toBe(4);
    expect(result.price_per_kg).toBe(9);
    expect(result.tier_applied).toEqual({ min_bags: 3, price_per_kg: 9 });
  });

  // ---------------------------------------------------------------------------
  // All tiers' min_bags > completed_bags → base price applies.
  // ---------------------------------------------------------------------------
  it("falls back to base when every tier's min_bags exceeds completed_bags", () => {
    const tiers: BagPricingTier[] = [
      { min_bags: 5, price_per_kg: 9 },
      { min_bags: 10, price_per_kg: 8.5 },
    ];
    const result = computeCompletedBagsAndPrice({
      total_committed_kg: 180, // 3 bags
      bag_size_kg: 60,
      base_price_per_kg: 10,
      tiers,
    });

    expect(result.completed_bags).toBe(3);
    expect(result.price_per_kg).toBe(10);
    expect(result.tier_applied).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Mix of legacy and converted tiers: legacy ones excluded, the converted
  // tier wins when it qualifies.
  // ---------------------------------------------------------------------------
  it("excludes legacy tiers but still applies converted ones", () => {
    const tiers: BagPricingTier[] = [
      { min_bags: null, price_per_kg: 9 }, // legacy — ignored
      { min_bags: 3, price_per_kg: 8.75 }, // converted — applies at 3+ bags
    ];
    const result = computeCompletedBagsAndPrice({
      total_committed_kg: 187,
      bag_size_kg: 60,
      base_price_per_kg: 10,
      tiers,
    });

    expect(result.completed_bags).toBe(3);
    expect(result.price_per_kg).toBe(8.75);
    expect(result.tier_applied).toEqual({ min_bags: 3, price_per_kg: 8.75 });
  });

  // ---------------------------------------------------------------------------
  // Just-below tier threshold edge: 179kg / 60kg = 2 bags. The 3-bag tier
  // does NOT apply; the 1-bag tier does.
  // ---------------------------------------------------------------------------
  it("respects the tier threshold strictly (179kg / 60kg → 2 bags, 1-bag tier)", () => {
    const tiers: BagPricingTier[] = [
      { min_bags: 1, price_per_kg: 10 },
      { min_bags: 3, price_per_kg: 9 },
    ];
    const result = computeCompletedBagsAndPrice({
      total_committed_kg: 179,
      bag_size_kg: 60,
      base_price_per_kg: 12,
      tiers,
    });

    expect(result.completed_bags).toBe(2);
    expect(result.price_per_kg).toBe(10);
    expect(result.tier_applied).toEqual({ min_bags: 1, price_per_kg: 10 });
  });

  // ---------------------------------------------------------------------------
  // Defensive: bad bag size → throws.
  // ---------------------------------------------------------------------------
  it("throws when bag_size_kg is zero or negative", () => {
    expect(() =>
      computeCompletedBagsAndPrice({
        total_committed_kg: 100,
        bag_size_kg: 0,
        base_price_per_kg: 10,
        tiers: [],
      })
    ).toThrow(/bag_size_kg/);

    expect(() =>
      computeCompletedBagsAndPrice({
        total_committed_kg: 100,
        bag_size_kg: -1,
        base_price_per_kg: 10,
        tiers: [],
      })
    ).toThrow(/bag_size_kg/);
  });

  // ---------------------------------------------------------------------------
  // Defensive: bad total kg → throws. Catches caller wiring bugs where a
  // failed SQL aggregate returns NaN or a negative value.
  // ---------------------------------------------------------------------------
  it("throws when total_committed_kg is negative or non-finite", () => {
    expect(() =>
      computeCompletedBagsAndPrice({
        total_committed_kg: -10,
        bag_size_kg: 60,
        base_price_per_kg: 10,
        tiers: [],
      })
    ).toThrow(/total_committed_kg/);

    expect(() =>
      computeCompletedBagsAndPrice({
        total_committed_kg: Number.NaN,
        bag_size_kg: 60,
        base_price_per_kg: 10,
        tiers: [],
      })
    ).toThrow(/total_committed_kg/);
  });
});

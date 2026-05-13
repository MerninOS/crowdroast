import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPlatformFee,
  applyStripeFeeToPlatformShare,
  computeChargeAdjustment,
  computeGrossAmountCents,
  computeSellerNetAmountCents,
  computeSplit,
  getFinalPricePerKg,
} from "./settlement-logic.js";

test("applyPlatformFee adds 10% to seller pricing", () => {
  assert.equal(applyPlatformFee(10), 11);
  assert.equal(applyPlatformFee(12.5), 13.75);
});

test("computeSplit returns seller, hub, and platform shares that sum to total", () => {
  const split = computeSplit({
    grossAmountCents: 12345,
    sellerNetAmountCents: 11223,
  });
  assert.equal(split.sellerAmount, 11223);
  assert.equal(split.hubAmount, 246);
  assert.equal(split.platformAmount, 876);
  assert.equal(split.sellerAmount + split.hubAmount + split.platformAmount, 12345);
});

test("computeSplit clamps platformAmount at 0 when sellerNet exceeds gross (defensive guard)", () => {
  // Contrived: a caller computed sellerNetAmountCents via independent rounding
  // that ended up one cent above the gross buyer-side total. Without the
  // guard, platformAmount would land at -1. The per-row sum strategy in
  // `lib/bag-transfer-out.ts` eliminates the bag-aware path's root cause,
  // but the guard here protects every other caller (legacy `/settle-deadlines`,
  // future call sites, etc.) from silently shipping a negative platform amount
  // to the database.
  const originalWarn = console.warn;
  let warned = false;
  console.warn = () => {
    warned = true;
  };
  try {
    const split = computeSplit({
      grossAmountCents: 1000,
      sellerNetAmountCents: 1001, // 1¢ over the buyer total
    });
    assert.equal(split.platformAmount, 0, "platformAmount must never be negative");
    assert.equal(split.hubAmount, 0, "hub is capped at total - seller = -1 → clamped to 0");
    assert.equal(split.sellerAmount, 1001);
    assert.ok(warned, "expected console.warn to surface the drift");
  } finally {
    console.warn = originalWarn;
  }
});

test("getFinalPricePerKg falls back to base price when no tiers are unlocked", () => {
  const finalPrice = getFinalPricePerKg(12.5, 100, [
    { min_quantity_kg: 250, price_per_kg: 11.5 },
    { min_quantity_kg: 500, price_per_kg: 10.5 },
  ]);
  assert.equal(finalPrice, 12.5);
});

test("getFinalPricePerKg picks the highest unlocked tier", () => {
  const finalPrice = getFinalPricePerKg(12.5, 550, [
    { min_quantity_kg: 250, price_per_kg: 11.5 },
    { min_quantity_kg: 500, price_per_kg: 10.5 },
  ]);
  assert.equal(finalPrice, 10.5);
});

test("computeChargeAdjustment refunds difference when final price is lower", () => {
  const adjustment = computeChargeAdjustment({
    quantityKg: 22.6796, // ~50 lb
    committedTotalPrice: 498.9512, // $22/kg at commit
    finalSellerPricePerKg: 18,
  });

  assert.equal(adjustment.committedAmountCents, 49895);
  assert.equal(adjustment.finalAmountCents, 44905);
  assert.equal(adjustment.refundAmountCents, 4990);
});

test("computeChargeAdjustment does not refund when final price is equal or higher", () => {
  const equal = computeChargeAdjustment({
    quantityKg: 10,
    committedTotalPrice: 110,
    finalSellerPricePerKg: 10,
  });
  assert.equal(equal.refundAmountCents, 0);

  const higher = computeChargeAdjustment({
    quantityKg: 10,
    committedTotalPrice: 110,
    finalSellerPricePerKg: 11,
  });
  assert.equal(higher.refundAmountCents, 0);
});

test("gross and seller net amount helpers stay aligned", () => {
  assert.equal(computeSellerNetAmountCents(10, 12.5), 12500);
  assert.equal(computeGrossAmountCents(10, 12.5), 13750);
});

test("applyStripeFeeToPlatformShare deducts fee from platform share, leaving seller and hub whole", () => {
  // Example: gross=$137.50, seller=$125, hub=$2.75, platform=$9.75; fee=$4.28
  // CrowdRoast keeps platform - fee = $5.47
  const result = applyStripeFeeToPlatformShare(975, 428);
  assert.equal(result.adjustedPlatformAmountCents, 547);
  assert.equal(result.feeAbsorbed, 428);
  assert.equal(result.feeShortfall, 0);
});

test("applyStripeFeeToPlatformShare floors platform share at 0 when fee exceeds it", () => {
  const result = applyStripeFeeToPlatformShare(100, 250);
  assert.equal(result.adjustedPlatformAmountCents, 0);
  assert.equal(result.feeAbsorbed, 100);
  assert.equal(result.feeShortfall, 150); // residual deficit on platform balance
});

test("applyStripeFeeToPlatformShare is a no-op when fee is zero or missing", () => {
  const zero = applyStripeFeeToPlatformShare(975, 0);
  assert.equal(zero.adjustedPlatformAmountCents, 975);
  assert.equal(zero.feeAbsorbed, 0);
  assert.equal(zero.feeShortfall, 0);

  const undef = applyStripeFeeToPlatformShare(975, undefined);
  assert.equal(undef.adjustedPlatformAmountCents, 975);
  assert.equal(undef.feeAbsorbed, 0);
});

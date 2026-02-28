import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPlatformFee,
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

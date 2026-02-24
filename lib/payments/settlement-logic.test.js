import test from "node:test";
import assert from "node:assert/strict";
import {
  computeChargeAdjustment,
  computeSplit,
  getFinalPricePerKg,
} from "./settlement-logic.js";

test("computeSplit returns seller, hub, and platform shares that sum to total", () => {
  const split = computeSplit(12345);
  assert.equal(split.sellerAmount, 11110);
  assert.equal(split.hubAmount, 246);
  assert.equal(split.platformAmount, 989);
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
    committedTotalPrice: 453.592, // $20/kg at commit
    finalPricePerKg: 18,
  });

  assert.equal(adjustment.committedAmountCents, 45359);
  assert.equal(adjustment.finalAmountCents, 40823);
  assert.equal(adjustment.refundAmountCents, 4536);
});

test("computeChargeAdjustment does not refund when final price is equal or higher", () => {
  const equal = computeChargeAdjustment({
    quantityKg: 10,
    committedTotalPrice: 100,
    finalPricePerKg: 10,
  });
  assert.equal(equal.refundAmountCents, 0);

  const higher = computeChargeAdjustment({
    quantityKg: 10,
    committedTotalPrice: 100,
    finalPricePerKg: 11,
  });
  assert.equal(higher.refundAmountCents, 0);
});


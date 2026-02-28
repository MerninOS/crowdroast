const HUB_SHARE_BPS = 200;
const PLATFORM_FEE_MULTIPLIER = 1.1;

export function applyPlatformFee(pricePerKg) {
  return Number((Number(pricePerKg || 0) * PLATFORM_FEE_MULTIPLIER).toFixed(5));
}

export function computeGrossAmountCents(quantityKg, sellerPricePerKg) {
  return Math.max(
    0,
    Math.round(Number(quantityKg || 0) * applyPlatformFee(sellerPricePerKg) * 100)
  );
}

export function computeSellerNetAmountCents(quantityKg, sellerPricePerKg) {
  return Math.max(
    0,
    Math.round(Number(quantityKg || 0) * Number(sellerPricePerKg || 0) * 100)
  );
}

export function computeSplit({ grossAmountCents, sellerNetAmountCents }) {
  const totalAmount = Math.max(0, Number(grossAmountCents || 0));
  const sellerAmount = Math.max(0, Number(sellerNetAmountCents || 0));
  const hubAmount = Math.floor((totalAmount * HUB_SHARE_BPS) / 10000);
  const cappedHubAmount = Math.max(0, Math.min(hubAmount, totalAmount - sellerAmount));
  const platformAmount = totalAmount - sellerAmount - cappedHubAmount;

  return { sellerAmount, hubAmount: cappedHubAmount, platformAmount };
}

export function getFinalPricePerKg(basePricePerKg, committedQuantityKg, tiers) {
  const basePrice = Number(basePricePerKg || 0);
  const committedQty = Number(committedQuantityKg || 0);
  const sorted = [...(tiers || [])].sort(
    (a, b) => Number(b.min_quantity_kg || 0) - Number(a.min_quantity_kg || 0)
  );

  for (const tier of sorted) {
    if (committedQty >= Number(tier.min_quantity_kg || 0)) {
      return Number(tier.price_per_kg || basePrice);
    }
  }

  return basePrice;
}

export function getFinalBuyerPricePerKg(basePricePerKg, committedQuantityKg, tiers) {
  return applyPlatformFee(
    getFinalPricePerKg(basePricePerKg, committedQuantityKg, tiers)
  );
}

export function computeChargeAdjustment({
  quantityKg,
  committedTotalPrice,
  finalSellerPricePerKg,
}) {
  const committedAmountCents = Math.max(
    0,
    Math.round(Number(committedTotalPrice || 0) * 100)
  );
  const finalAmountCents = computeGrossAmountCents(quantityKg, finalSellerPricePerKg);
  const refundAmountCents = Math.max(0, committedAmountCents - finalAmountCents);

  return {
    committedAmountCents,
    finalAmountCents,
    refundAmountCents,
  };
}

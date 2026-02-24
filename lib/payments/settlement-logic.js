const SELLER_SHARE_BPS = 9000;
const HUB_SHARE_BPS = 200;
const TOTAL_BPS = 10000;

export function computeSplit(amountCents) {
  const sellerAmount = Math.floor((amountCents * SELLER_SHARE_BPS) / TOTAL_BPS);
  const hubAmount = Math.floor((amountCents * HUB_SHARE_BPS) / TOTAL_BPS);
  const platformAmount = amountCents - sellerAmount - hubAmount;

  return { sellerAmount, hubAmount, platformAmount };
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

export function computeChargeAdjustment({
  quantityKg,
  committedTotalPrice,
  finalPricePerKg,
}) {
  const committedAmountCents = Math.max(
    0,
    Math.round(Number(committedTotalPrice || 0) * 100)
  );
  const finalAmountCents = Math.max(
    0,
    Math.round(Number(quantityKg || 0) * Number(finalPricePerKg || 0) * 100)
  );
  const refundAmountCents = Math.max(0, committedAmountCents - finalAmountCents);

  return {
    committedAmountCents,
    finalAmountCents,
    refundAmountCents,
  };
}


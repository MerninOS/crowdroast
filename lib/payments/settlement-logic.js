const HUB_SHARE_BPS = 200;
// Must match PLATFORM_FEE_RATE in lib/pricing.ts (1 + 0.10). Kept as a local
// constant rather than imported because this file is also run through the
// `node:test` runner (which can't resolve `.ts` imports), so we maintain a
// hand-mirrored copy. Any change here MUST be paired with a matching change
// in lib/pricing.ts.
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
  let platformAmount = totalAmount - sellerAmount - cappedHubAmount;
  if (platformAmount < 0) {
    console.warn("[computeSplit] platformAmount negative, clamping to 0 — investigate", { totalAmount, sellerAmount, cappedHubAmount });
    platformAmount = 0;
  }

  return { sellerAmount, hubAmount: cappedHubAmount, platformAmount };
}

// CrowdRoast covers Stripe processing fees out of its own platform share so
// seller and hub always receive their full split. Floor at 0; if the fee
// exceeds the platform amount on a tiny commit, the residual `feeShortfall`
// stays as a real deficit on the platform's main Stripe balance — surface it
// so callers can log/alert.
export function applyStripeFeeToPlatformShare(platformAmountCents, stripeFeeCents) {
  const platform = Math.max(0, Math.round(Number(platformAmountCents || 0)));
  const fee = Math.max(0, Math.round(Number(stripeFeeCents || 0)));
  const feeAbsorbed = Math.min(platform, fee);
  return {
    adjustedPlatformAmountCents: platform - feeAbsorbed,
    feeAbsorbed,
    feeShortfall: fee - feeAbsorbed,
  };
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

// Note for the buyer-referral feature: credit-debit logic that consumes
// inviter credits against Mernin's share lives at lib/referrals/apply-credit
// .ts and is invoked from the settle-deadlines route AFTER computeSplit() has
// produced the platform amount. computeChargeAdjustment stays a pure
// refund-the-diff function — it does not know about credits. See
// ~/Documents/crowdroast/buyer-referral-invites/spec.md.
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

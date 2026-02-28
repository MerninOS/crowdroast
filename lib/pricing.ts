const PRICE_DECIMALS = 5;

export const PLATFORM_FEE_RATE = 0.1;
export const HUB_SHARE_BPS = 200;

function roundPrice(value: number): number {
  const factor = 10 ** PRICE_DECIMALS;
  return Math.round(value * factor) / factor;
}

export function addPlatformFee(price: number): number {
  return roundPrice(Number(price || 0) * (1 + PLATFORM_FEE_RATE));
}

export function computeSellerNetAmountCents({
  quantityKg,
  sellerPricePerKg,
}: {
  quantityKg: number;
  sellerPricePerKg: number;
}) {
  return Math.max(
    0,
    Math.round(Number(quantityKg || 0) * Number(sellerPricePerKg || 0) * 100)
  );
}

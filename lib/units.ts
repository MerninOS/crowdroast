export type WeightUnit = "kg" | "lb";

export const DEFAULT_WEIGHT_UNIT: WeightUnit = "kg";
export const LB_PER_KG = 2.2046226218;
const PRICE_CALC_DECIMALS = 5;

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function toDisplayWeight(kg: number, unit: WeightUnit): number {
  return unit === "lb" ? kg * LB_PER_KG : kg;
}

export function fromDisplayWeight(value: number, unit: WeightUnit): number {
  return unit === "lb" ? value / LB_PER_KG : value;
}

export function toDisplayPricePerUnit(pricePerKg: number, unit: WeightUnit): number {
  const converted = unit === "lb" ? pricePerKg / LB_PER_KG : pricePerKg;
  return roundTo(converted, PRICE_CALC_DECIMALS);
}

export function fromDisplayPricePerUnit(value: number, unit: WeightUnit): number {
  const converted = unit === "lb" ? value * LB_PER_KG : value;
  return roundTo(converted, PRICE_CALC_DECIMALS);
}

export function formatUnitWeight(kg: number, unit: WeightUnit, maximumFractionDigits = 1): string {
  return toDisplayWeight(kg, unit).toLocaleString(undefined, { maximumFractionDigits });
}

export function formatUnitPrice(pricePerKg: number, unit: WeightUnit, currency = "USD"): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toDisplayPricePerUnit(pricePerKg, unit));
}

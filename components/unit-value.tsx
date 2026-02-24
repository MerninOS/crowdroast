"use client";

import React from "react";
import { useUnitPreference } from "@/components/unit-provider";
import { formatUnitPrice, formatUnitWeight } from "@/lib/units";

export function UnitWeightText({
  kg,
  className,
  suffix = true,
  maximumFractionDigits = 1,
}: {
  kg: number;
  className?: string;
  suffix?: boolean;
  maximumFractionDigits?: number;
}) {
  const { unit } = useUnitPreference();
  return (
    <span className={className}>
      {formatUnitWeight(kg, unit, maximumFractionDigits)}
      {suffix ? ` ${unit}` : ""}
    </span>
  );
}

export function UnitPriceText({
  pricePerKg,
  currency = "USD",
  className,
  showUnit = true,
}: {
  pricePerKg: number;
  currency?: string;
  className?: string;
  showUnit?: boolean;
}) {
  const { unit } = useUnitPreference();
  return (
    <span className={className}>
      {formatUnitPrice(pricePerKg, unit, currency)}
      {showUnit ? `/${unit}` : ""}
    </span>
  );
}

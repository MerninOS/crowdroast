"use client";

import React from "react";
import { useUnitPreference } from "@/components/unit-provider";
import { formatUnitPrice, formatUnitWeight } from "@/lib/units";
import { addPlatformFee } from "@/lib/pricing";

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
  includePlatformFee = false,
}: {
  pricePerKg: number;
  currency?: string;
  className?: string;
  showUnit?: boolean;
  includePlatformFee?: boolean;
}) {
  const { unit } = useUnitPreference();
  const displayPrice = includePlatformFee
    ? addPlatformFee(pricePerKg)
    : pricePerKg;
  return (
    <span className={className}>
      {formatUnitPrice(displayPrice, unit, currency)}
      {showUnit ? `/${unit}` : ""}
    </span>
  );
}

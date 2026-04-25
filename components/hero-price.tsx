"use client";
import { useUnitPreference } from "@/components/unit-provider";
import { formatUnitPrice } from "@/lib/units";

export function HeroPrice({ pricePerKg, currency }: { pricePerKg: number; currency: string }) {
  const { unit } = useUnitPreference();
  return (
    <div style={{ fontFamily: "'Cal Sans', system-ui, sans-serif", fontWeight: 800, fontSize: 34, lineHeight: 1, color: "#F5F0D8" }}>
      {formatUnitPrice(pricePerKg, unit, currency)}
      <span style={{ fontSize: 14, opacity: 0.55, fontWeight: 600 }}>/{unit}</span>
    </div>
  );
}

export function HeroCommitLabel() {
  const { unit } = useUnitPreference();
  return <>Commit {unit} →</>;
}

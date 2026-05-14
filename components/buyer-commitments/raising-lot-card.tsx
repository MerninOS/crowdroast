"use client";

import Link from "next/link";
import Image from "next/image";
import { forwardRef, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button, TierBar, type TierBarTick } from "@merninos/ui";
import { addPlatformFee } from "@/lib/pricing";
import { UnitPriceText, UnitWeightText } from "@/components/unit-value";
import { useUnitPreference } from "@/components/unit-provider";
import { formatUnitPrice, toDisplayWeight } from "@/lib/units";
import { getTierProgress } from "@/lib/tier-progress";
import type { CommitmentGroup } from "./bucket-by-lifecycle";

export interface RaisingLotCardProps {
  group: CommitmentGroup;
  /**
   * Pricing tiers fetched for this lot. Bag-aware tiers carry a non-null
   * `min_bags`; legacy tiers carry only `min_quantity_kg`. The card resolves
   * both modes via `getTierProgress`.
   */
  pricingTiers: {
    min_bags: number | null;
    min_quantity_kg: number | null;
    price_per_kg: number;
  }[];
  /** Fired when the buyer wants to open the per-lot drawer. */
  onSelect?: () => void;
  /** Forwarded to the chevron button so the parent can return focus on close. */
  triggerRef?: React.Ref<HTMLButtonElement>;
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);

function fmtCountdown(deadline: string | null | undefined, nowMs: number): { label: string; goingFast: boolean } {
  if (!deadline) return { label: "—", goingFast: false };
  const ms = Math.max(0, new Date(deadline).getTime() - nowMs);
  if (ms === 0) return { label: "Ended", goingFast: false };
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const goingFast = ms < 24 * 3_600_000;
  if (d > 0) return { label: `${d}d ${String(h).padStart(2, "0")}h`, goingFast };
  if (h > 0) return { label: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`, goingFast };
  if (m > 0) return { label: `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`, goingFast };
  return { label: `${s}s`, goingFast };
}

export function RaisingLotCard({ group, pricingTiers, onSelect, triggerRef }: RaisingLotCardProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const { unit } = useUnitPreference();

  const lot = group.lot;
  const myCommits = group.commitments.filter((c) => c.status !== "cancelled" && c.payment_status !== "charge_failed");
  const myKg = myCommits.reduce((s, c) => s + Number(c.quantity_kg || 0), 0);
  const myValue = myCommits.reduce((s, c) => s + Number(c.quantity_kg || 0) * addPlatformFee(Number(c.price_per_kg || 0)), 0);

  // Use the lot's running global commitment total. Fall back to the user's
  // own commitments only if the lot column is null/0 — covers buyer-only DBs.
  const lotCommittedKg = Number(lot?.committed_quantity_kg || 0);
  const committedKg = lotCommittedKg > 0 ? lotCommittedKg : myKg;
  const targetKg = Number(lot?.total_quantity_kg || 0);
  const progress = getTierProgress(
    {
      committed_quantity_kg: committedKg,
      price_per_kg: Number(lot?.price_per_kg || 0),
      bag_size_kg: lot?.bag_size_kg ?? null,
    },
    pricingTiers
  );
  const tierMaxes = progress.sortedTiers.map((t) => t.threshold_kg);
  const maxKg = Math.max(targetKg, ...tierMaxes, committedKg, 1);
  const committedDisplay = toDisplayWeight(committedKg, unit);
  const maxBarUnits = toDisplayWeight(maxKg, unit);
  const ticks: TierBarTick[] = progress.sortedTiers
    .filter((t) => t.threshold_kg > 0)
    .map((t) => ({
      position: toDisplayWeight(t.threshold_kg, unit),
      sub: `${formatUnitPrice(addPlatformFee(t.price_per_kg), unit, "USD")}/${unit}`,
    }));

  const nextTier = progress.nextTier;
  const bagsToNext = progress.bagsToNext;
  const deadline = group.campaign?.deadline ?? lot?.commitment_deadline ?? null;
  const { label: countdownLabel, goingFast } = fmtCountdown(deadline, now);
  const photoUrl = lot?.images?.[0] || null;

  return (
    <div
      className={`grid grid-cols-1 overflow-hidden rounded-[14px] border-[3px] bg-chalk shadow-flat-md md:grid-cols-[180px_1fr_220px] ${
        goingFast ? "border-tomato" : "border-espresso"
      }`}
    >
      {/* Photo column — full width banner on mobile, side panel on desktop */}
      <div className="relative h-[140px] bg-roast md:h-auto md:min-h-[180px]">
        {photoUrl ? (
          <Image
            src={photoUrl}
            alt={lot?.title || "lot photo"}
            fill
            sizes="180px"
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-roast to-honey/40" aria-hidden />
        )}
        {lot?.score != null && (
          <div className="absolute left-2.5 top-2.5 rounded-full border-2 border-espresso bg-sun px-2.5 py-1 font-headline text-[10px] font-extrabold tracking-[0.1em] text-espresso">
            {Number(lot.score).toFixed(1)} PTS
          </div>
        )}
        {goingFast && (
          <div className="absolute inset-x-2.5 bottom-2.5 rounded border-2 border-espresso bg-tomato px-2.5 py-1 text-center font-headline text-[9.5px] font-extrabold uppercase tracking-[0.14em] text-cream">
            ⚡ Going fast
          </div>
        )}
      </div>

      {/* Detail column */}
      <div className="flex flex-col p-5">
        <div className="font-headline text-[9.5px] font-extrabold uppercase tracking-[0.18em] text-espresso/60">
          {(lot?.region || lot?.origin_country || "").toString().toUpperCase()}
          {lot?.region && lot?.origin_country ? ` · ${lot.origin_country.toUpperCase()}` : ""}
        </div>
        {onSelect ? (
          <button
            ref={triggerRef}
            type="button"
            onClick={onSelect}
            data-testid={`raising-card-trigger-${group.groupKey}`}
            className="mt-1 inline-flex items-center gap-1.5 text-left font-headline text-[20px] font-bold leading-tight text-espresso transition-colors hover:text-tomato focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tomato focus-visible:ring-offset-2 focus-visible:ring-offset-chalk rounded-sm"
          >
            {lot?.title || "Unknown lot"}
            <ChevronRight className="h-4 w-4 shrink-0 text-espresso/55" strokeWidth={2.5} />
          </button>
        ) : (
          <Link
            href={`/dashboard/buyer/lot/${group.lotId}${group.hubId ? `?hub=${group.hubId}` : ""}`}
            className="mt-1 font-headline text-[20px] font-bold leading-tight text-espresso transition-colors hover:text-tomato"
          >
            {lot?.title || "Unknown lot"}
          </Link>
        )}
        {(lot?.farm || lot?.process) && (
          <div className="mb-3.5 mt-1 font-headline text-xs italic text-espresso/60">
            {[lot?.farm, lot?.process].filter(Boolean).join(" · ")}
          </div>
        )}

        <TierBar value={committedDisplay} max={maxBarUnits} ticks={ticks} variant="tomato" />

        <div className="mt-3 flex items-center gap-1.5 font-headline text-[11px] text-espresso">
          {nextTier ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-tomato" aria-hidden />
              <span className="font-extrabold tracking-[0.06em]">NEXT TIER</span>
              <span className="opacity-70">·</span>
              <span>
                {progress.isBagAware ? (
                  <>
                    {bagsToNext} bag{bagsToNext === 1 ? "" : "s"} to{" "}
                  </>
                ) : (
                  <>
                    <UnitWeightText kg={nextTier.threshold_kg - committedKg} maximumFractionDigits={0} /> to{" "}
                  </>
                )}
                <b>
                  <UnitPriceText pricePerKg={nextTier.price_per_kg} currency="usd" includePlatformFee />
                </b>
              </span>
            </>
          ) : (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-matcha" aria-hidden />
              <span className="font-extrabold uppercase tracking-[0.06em] text-matcha">Full tier unlocked</span>
            </>
          )}
        </div>
      </div>

      {/* Position + CTA column — bottom strip on mobile, side panel on desktop */}
      <div className="flex flex-col justify-between gap-3 border-t-2 border-dashed border-espresso/20 bg-cream p-5 md:border-l-2 md:border-t-0">
        <div>
          <div className="font-headline text-[9px] font-extrabold uppercase tracking-[0.18em] text-espresso/55">
            Closes in
          </div>
          <div className="mt-1 font-headline text-[24px] font-bold leading-none text-tomato tabular-nums">{countdownLabel}</div>
          <div className="mt-3 font-headline text-[9px] font-extrabold uppercase tracking-[0.18em] text-espresso/55">
            Your position
          </div>
          <div className="mt-0.5 font-headline text-[15px] font-extrabold text-espresso">
            <UnitWeightText kg={myKg} maximumFractionDigits={0} />
          </div>
          <div className="mt-px font-headline text-[11px] text-espresso/60">
            {fmtMoney(myValue)} @ <UnitPriceText pricePerKg={Number(lot?.price_per_kg || 0)} currency="usd" includePlatformFee />
          </div>
        </div>
        <Button asChild variant="sun" size="sm" className="mt-3">
          <Link href={`/dashboard/buyer/lot/${group.lotId}${group.hubId ? `?hub=${group.hubId}` : ""}`}>Commit more →</Link>
        </Button>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Button, TierBar, type TierBarTick } from "@merninos/ui";
import { addPlatformFee } from "@/lib/pricing";
import { UnitPriceText, UnitWeightText } from "@/components/unit-value";
import type { CommitmentGroup } from "./bucket-by-lifecycle";

export interface RaisingLotCardProps {
  group: CommitmentGroup;
  /** Sorted ascending by min_quantity_kg from the page query. */
  pricingTiers: { min_quantity_kg: number; price_per_kg: number }[];
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

export function RaisingLotCard({ group, pricingTiers }: RaisingLotCardProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const lot = group.lot;
  const myCommits = group.commitments.filter((c) => c.status !== "cancelled" && c.payment_status !== "charge_failed");
  const myKg = myCommits.reduce((s, c) => s + Number(c.quantity_kg || 0), 0);
  const myValue = myCommits.reduce((s, c) => s + Number(c.quantity_kg || 0) * addPlatformFee(Number(c.price_per_kg || 0)), 0);

  // Use the lot's running global commitment total. Fall back to the user's
  // own commitments only if the lot column is null/0 — covers buyer-only DBs.
  const lotCommittedKg = Number(lot?.committed_quantity_kg || 0);
  const committedKg = lotCommittedKg > 0 ? lotCommittedKg : myKg;
  const targetKg = Number(lot?.total_quantity_kg || 0);
  const tierMaxes = pricingTiers.map((t) => Number(t.min_quantity_kg));
  const maxBarUnits = Math.max(targetKg, ...tierMaxes, committedKg, 1);
  const ticks: TierBarTick[] = pricingTiers
    .filter((t) => Number(t.min_quantity_kg) > 0)
    .map((t) => ({
      position: Number(t.min_quantity_kg),
      sub: `${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(addPlatformFee(Number(t.price_per_kg)))}/lb`,
    }));

  const nextTier = pricingTiers.find((t) => Number(t.min_quantity_kg) > committedKg);
  const deadline = group.campaign?.deadline ?? lot?.commitment_deadline ?? null;
  const { label: countdownLabel, goingFast } = fmtCountdown(deadline, now);
  const photoUrl = lot?.images?.[0] || null;

  return (
    <div
      className={`relative grid grid-cols-1 overflow-hidden rounded-[14px] border-[3px] bg-chalk shadow-flat-md md:grid-cols-[180px_1fr_220px] ${
        goingFast ? "border-tomato" : "border-espresso"
      }`}
    >
      {/* Photo column */}
      <div className="relative min-h-[180px] bg-roast">
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
        <Link
          href={`/dashboard/buyer/lot/${group.lotId}`}
          className="mt-1 font-headline text-[20px] font-bold leading-tight text-espresso transition-colors hover:text-tomato"
        >
          {lot?.title || "Unknown lot"}
        </Link>
        {(lot?.farm || lot?.process) && (
          <div className="mb-3.5 mt-1 font-headline text-xs italic text-espresso/60">
            {[lot?.farm, lot?.process].filter(Boolean).join(" · ")}
          </div>
        )}

        <TierBar value={committedKg} max={maxBarUnits} ticks={ticks} variant="tomato" />

        <div className="mt-3 flex items-center gap-1.5 font-headline text-[11px] text-espresso">
          {nextTier ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-tomato" aria-hidden />
              <span className="font-extrabold tracking-[0.06em]">NEXT TIER</span>
              <span className="opacity-70">·</span>
              <span>
                <UnitWeightText kg={Number(nextTier.min_quantity_kg) - committedKg} maximumFractionDigits={0} /> to{" "}
                <b>
                  <UnitPriceText pricePerKg={Number(nextTier.price_per_kg)} currency="usd" includePlatformFee />
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

      {/* Position + CTA column */}
      <div className="flex flex-col justify-between border-l-2 border-dashed border-espresso/20 bg-cream p-5">
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
          <Link href={`/dashboard/buyer/lot/${group.lotId}`}>Commit more →</Link>
        </Button>
      </div>
    </div>
  );
}

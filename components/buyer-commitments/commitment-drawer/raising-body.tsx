"use client";

import Link from "next/link";
import { Button } from "@merninos/ui";
import { addPlatformFee } from "@/lib/pricing";
import { UnitPriceText, UnitWeightText } from "@/components/unit-value";
import { ContributionsTable } from "./contributions-table";
import type { CommitmentGroup } from "../bucket-by-lifecycle";

export interface RaisingDrawerBodyProps {
  group: CommitmentGroup;
  /** Sorted ascending by min_quantity_kg from the page query. */
  tiers: { min_quantity_kg: number; price_per_kg: number }[];
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n || 0);

function fmtCountdown(deadline: string | null | undefined): string {
  if (!deadline) return "—";
  const ms = Math.max(0, new Date(deadline).getTime() - Date.now());
  if (ms === 0) return "Ended";
  const d = Math.floor(ms / 86_400_000);
  if (d > 0) return `${d}d left`;
  const h = Math.floor(ms / 3_600_000);
  if (h > 0) return `${h}h left`;
  const m = Math.floor(ms / 60_000);
  return `${m}m left`;
}

export function RaisingDrawerBody({ group, tiers }: RaisingDrawerBodyProps) {
  const lot = group.lot;
  const myCommits = group.commitments.filter(
    (c) => c.status !== "cancelled" && c.payment_status !== "charge_failed"
  );
  const myKg = myCommits.reduce((s, c) => s + Number(c.quantity_kg || 0), 0);
  const myExposure = myCommits.reduce(
    (s, c) =>
      s + Number(c.quantity_kg || 0) * addPlatformFee(Number(c.price_per_kg || 0)),
    0
  );

  const campaignTotal = Number(lot?.committed_quantity_kg || 0);
  const minKg = Number(lot?.min_commitment_kg || 0);
  const belowMin = minKg > 0 && campaignTotal < minKg;
  const gapToMin = Math.max(0, minKg - campaignTotal);

  // The current tier is the highest one whose threshold has been met. If
  // none yet, fall back to the lot's base price (which is what the buyer
  // is currently committed at).
  const sortedTiers = [...tiers].sort(
    (a, b) => Number(a.min_quantity_kg) - Number(b.min_quantity_kg)
  );
  const unlockedTiers = sortedTiers.filter(
    (t) => campaignTotal >= Number(t.min_quantity_kg)
  );
  const currentTier = unlockedTiers[unlockedTiers.length - 1] ?? null;
  const currentBuyerPrice = addPlatformFee(
    Number(currentTier?.price_per_kg ?? lot?.price_per_kg ?? 0)
  );

  const deadline = group.campaign?.deadline ?? lot?.commitment_deadline ?? null;
  const commitMoreHref = `/dashboard/buyer/lot/${group.lotId}${
    group.hubId ? `?hub=${group.hubId}` : ""
  }`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-body text-[11px] font-extrabold uppercase tracking-[0.14em] text-espresso/60">
          Closes in
        </div>
        <div
          className="font-headline text-base font-bold text-tomato"
          data-testid="raising-deadline"
        >
          {fmtCountdown(deadline)}
        </div>
      </div>

      {belowMin && (
        <div
          className="rounded-md border-[3px] border-tomato bg-tomato/10 px-4 py-3 font-body text-sm text-espresso"
          data-testid="raising-urgency"
        >
          <div className="font-headline text-[11px] font-extrabold uppercase tracking-[0.12em] text-tomato">
            Below minimum
          </div>
          <div className="mt-1">
            <span className="font-bold tabular-nums">
              <UnitWeightText kg={gapToMin} maximumFractionDigits={0} />
            </span>{" "}
            still needed. If the lot doesn't hit its minimum, all commits get
            refunded.
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 rounded-md border-2 border-espresso bg-chalk p-4">
        <SummaryStat
          label="Your commits"
          value={<UnitWeightText kg={myKg} maximumFractionDigits={1} />}
        />
        <SummaryStat label="Your exposure" value={fmtMoney(myExposure)} />
        <SummaryStat
          label="Campaign total"
          value={<UnitWeightText kg={campaignTotal} maximumFractionDigits={0} />}
        />
        <SummaryStat
          label="Minimum"
          value={<UnitWeightText kg={minKg} maximumFractionDigits={0} />}
        />
      </div>

      {/*
       * Card-saved indicator for bag-aware commits (setup_intent path).
       * Bag-aware commits never charge upfront — Stripe saves the card via
       * a setup_intent and we charge it bag-by-bag at settlement. This
       * banner is the buyer-facing confirmation that their card is on
       * file but no money has moved yet.
       */}
      {myCommits.some(
        (c) =>
          c.stripe_setup_intent_id != null &&
          (c.payment_status === "setup_complete" ||
            c.payment_status === "pending_setup")
      ) && (
        <div
          className="flex items-start gap-3 rounded-md border-[3px] border-matcha bg-matcha/10 px-4 py-3"
          data-testid="raising-card-saved"
        >
          <div
            aria-hidden="true"
            className="font-headline text-lg leading-none text-matcha"
          >
            ✓
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="font-body text-[11px] font-extrabold uppercase tracking-[0.12em] text-matcha">
              Card on file
            </div>
            <div className="font-body text-sm text-espresso">
              No charge yet. We&apos;ll bill your card for each bag as it
              fills — you only pay for coffee that actually ships.
            </div>
          </div>
        </div>
      )}

      {sortedTiers.length > 0 && (
        <div className="flex flex-col gap-2" data-testid="raising-tier-list">
          <div className="font-body text-[11px] font-extrabold uppercase tracking-[0.14em] text-espresso/60">
            Pricing tiers
          </div>
          <div className="flex flex-col gap-1.5">
            {sortedTiers.map((t) => {
              const tierThreshold = Number(t.min_quantity_kg);
              const tierBuyerPrice = addPlatformFee(Number(t.price_per_kg));
              const tierSellerPrice = Number(t.price_per_kg);
              const unlocked = campaignTotal >= tierThreshold;
              const personalDelta = unlocked
                ? 0
                : Math.max(0, (currentBuyerPrice - tierBuyerPrice) * myKg);
              return (
                <div
                  key={tierThreshold}
                  data-testid={`raising-tier-${tierThreshold}`}
                  data-unlocked={unlocked ? "true" : "false"}
                  className={`flex items-center justify-between gap-3 rounded-md border-2 px-3 py-2 ${
                    unlocked
                      ? "border-matcha bg-matcha/10"
                      : "border-espresso/30 bg-cream/40"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-headline text-sm font-extrabold tabular-nums text-espresso">
                      <UnitWeightText kg={tierThreshold} maximumFractionDigits={0} />
                    </span>
                    <span className="font-body text-sm text-espresso/70 tabular-nums">
                      <UnitPriceText
                        pricePerKg={tierSellerPrice}
                        currency="USD"
                        includePlatformFee
                      />
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {unlocked ? (
                      <span className="rounded-pill bg-matcha px-2 py-0.5 font-body text-[10px] font-extrabold uppercase tracking-[0.1em] text-cream">
                        Unlocked
                      </span>
                    ) : (
                      <>
                        {personalDelta > 0 && myKg > 0 && (
                          <span
                            className="font-body text-xs font-bold text-tomato tabular-nums"
                            data-testid={`raising-tier-delta-${tierThreshold}`}
                          >
                            +{fmtMoney(personalDelta)} if reached
                          </span>
                        )}
                        <span className="rounded-pill border-[1.5px] border-espresso/40 px-2 py-0.5 font-body text-[10px] font-extrabold uppercase tracking-[0.1em] text-espresso/55">
                          Locked
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="font-body text-[11px] font-extrabold uppercase tracking-[0.14em] text-espresso/60">
          Your contributions
        </div>
        <ContributionsTable commitments={group.commitments} />
      </div>

      <Button asChild variant="default" size="default" className="self-start">
        <Link href={commitMoreHref} data-testid="raising-commit-more">
          Commit more →
        </Link>
      </Button>
    </div>
  );
}

function SummaryStat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <span className="font-body text-[10px] font-extrabold uppercase tracking-[0.14em] text-espresso/55">
        {label}
      </span>
      <span className="font-headline text-base font-extrabold tabular-nums text-espresso">
        {value}
      </span>
    </div>
  );
}

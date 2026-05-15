import * as React from "react";
import { addPlatformFee } from "@/lib/pricing";
import { UnitWeightText } from "@/components/unit-value";
import { ContributionsTable } from "./contributions-table";
import {
  effectiveChargedCents,
  STAGE_META,
  stageOfGroup,
  type CommitmentGroup,
  type StageColor,
} from "../bucket-by-lifecycle";
import { commitmentDisplayKg } from "@/lib/commitment-kg";

export interface InMotionDrawerBodyProps {
  group: CommitmentGroup;
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n || 0);

const STAGE_PILL_BG: Record<StageColor, string> = {
  tomato: "bg-tomato text-cream",
  honey: "bg-honey text-espresso",
  sky: "bg-sky text-espresso",
  sun: "bg-sun text-espresso",
  matcha: "bg-matcha text-cream",
  fog: "bg-fog text-espresso",
  espresso: "bg-espresso text-cream",
};

export function InMotionDrawerBody({ group }: InMotionDrawerBodyProps) {
  const lot = group.lot;
  const stage = stageOfGroup(group);
  const stageMeta = STAGE_META[stage];

  // "Settled" = non-cancelled commits in this group. For bag-aware commits
  // the per-commit settled weight is `kg_locked_at_settlement` (set by
  // settle-deadlines once the campaign settles), not the original pledge.
  // Reading via `commitmentDisplayKg` makes a partial-fill commit show
  // the actually-locked kg, not the over-pledged amount.
  const settled = group.commitments.filter((c) => c.status !== "cancelled");
  const settledKg = settled.reduce(
    (s, c) => s + commitmentDisplayKg(c),
    0
  );
  // Paid = cents that actually moved. Bag-aware: sum of `charged` bag rows.
  // Legacy: commitment.charge_amount_cents (net of refunds).
  const paidCents = settled.reduce(
    (s, c) => s + effectiveChargedCents(c, group.bagChargesByCommitmentId?.[c.id]),
    0
  );
  const paid = paidCents / 100;
  // Saved versus base = (base_price_with_fee × kg actually settled) − actually paid.
  // The kg axis must match `paid` — locked kg post-settle, pledge pre-settle —
  // otherwise a partial-fill commit overstates "saved" by including unsettled kg.
  const basePrice = Number(lot?.price_per_kg || 0);
  const baseWithFee = basePrice > 0 ? addPlatformFee(basePrice) : 0;
  const baselinePaid = settled.reduce(
    (s, c) => s + baseWithFee * commitmentDisplayKg(c),
    0
  );
  const saved = Math.max(0, baselinePaid - paid);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-body text-[11px] font-extrabold uppercase tracking-[0.14em] text-espresso/60">
          Stage
        </div>
        <span
          data-testid="in-motion-stage-pill"
          data-stage={stage}
          className={`rounded-pill border-2 border-espresso px-3 py-0.5 font-body text-[11px] font-extrabold uppercase tracking-[0.1em] ${STAGE_PILL_BG[stageMeta.color]}`}
        >
          {stageMeta.label}
        </span>
      </div>

      <div
        className="grid grid-cols-3 gap-3 rounded-md border-2 border-espresso bg-chalk p-4"
        data-testid="in-motion-summary"
      >
        <SummaryStat
          testId="in-motion-stat-settled"
          label="Settled"
          value={<UnitWeightText kg={settledKg} maximumFractionDigits={1} />}
        />
        <SummaryStat
          testId="in-motion-stat-paid"
          label="Paid"
          value={fmtMoney(paid)}
        />
        <SummaryStat
          testId="in-motion-stat-saved"
          label="Saved"
          value={saved > 0 ? fmtMoney(saved) : "—"}
          tone={saved > 0 ? "matcha" : undefined}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="font-body text-[11px] font-extrabold uppercase tracking-[0.14em] text-espresso/60">
          Your contributions
        </div>
        <ContributionsTable commitments={group.commitments} />
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone,
  testId,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "matcha";
  testId?: string;
}) {
  return (
    <div className="flex flex-col" data-testid={testId}>
      <span className="font-body text-[10px] font-extrabold uppercase tracking-[0.14em] text-espresso/55">
        {label}
      </span>
      <span
        className={`font-headline text-base font-extrabold tabular-nums ${
          tone === "matcha" ? "text-matcha" : "text-espresso"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

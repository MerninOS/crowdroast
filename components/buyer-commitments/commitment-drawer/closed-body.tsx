import { addPlatformFee } from "@/lib/pricing";
import { UnitPriceText, UnitWeightText } from "@/components/unit-value";
import { getTierProgress } from "@/lib/tier-progress";
import { ContributionsTable } from "./contributions-table";
import { BagBreakdown } from "./bag-breakdown";
import { refundDollarsFor } from "./refund-amount";
import {
  effectiveChargedCents,
  type CommitmentGroup,
} from "../bucket-by-lifecycle";
import { commitmentDisplayKg } from "@/lib/commitment-kg";

export interface ClosedDrawerBodyProps {
  group: CommitmentGroup;
  /**
   * "value" — picked_up | done. Lead with savings + qty.
   * "refund" — minimum_not_met. Lead with refund total, suppress savings/CTA.
   */
  mode: "value" | "refund";
  /**
   * Pricing tiers fetched for this lot. Bag-aware tiers carry a non-null
   * `min_bags`; legacy tiers carry only `min_quantity_kg`.
   */
  tiers?: {
    min_bags: number | null;
    min_quantity_kg: number | null;
    price_per_kg: number;
  }[];
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n || 0);

export function ClosedDrawerBody({
  group,
  mode,
  tiers = [],
}: ClosedDrawerBodyProps) {
  const lot = group.lot;

  // Non-cancelled commits in this group are the "settled" set. Bag-aware
  // commits stay at `setup_complete` even after picking up, so the legacy
  // `charge_succeeded` filter would render an empty drawer for them. Read
  // `kg_locked_at_settlement` via `commitmentDisplayKg` for per-commit kg
  // so partial-fill rounding shows up correctly.
  const succeeded = group.commitments.filter((c) => c.status !== "cancelled");
  const totalKg = succeeded.reduce((s, c) => s + commitmentDisplayKg(c), 0);
  const paidCents = succeeded.reduce(
    (s, c) => s + effectiveChargedCents(c, group.bagChargesByCommitmentId?.[c.id]),
    0
  );
  const paid = paidCents / 100;
  const totalRefund = group.commitments.reduce(
    (s, c) => s + refundDollarsFor(c),
    0
  );

  // Sum inviter credit applied across all commitments in this group. Source
  // is the credit_ledger commit_applied rows the page already fetched and
  // attached to the group. Settle-deadlines also issues a Stripe refund on
  // the buyer's payment method for this exact amount, so the copy frames it
  // as money returned to their card — not a soft "credit redeemed" only.
  const creditAppliedDollars = succeeded.reduce(
    (s, c) =>
      s + (group.creditAppliedByCommitmentId?.[c.id] ?? 0) / 100,
    0
  );

  if (mode === "refund") {
    return (
      <div className="flex flex-col gap-5" data-testid="closed-drawer-body">
        <div
          className="rounded-md border-[3px] border-tomato bg-cream p-5"
          data-testid="closed-refund-header"
        >
          <div className="font-body text-[11px] font-extrabold uppercase tracking-[0.14em] text-tomato">
            Lot didn't hit minimum
          </div>
          <div className="mt-1 font-headline text-3xl font-bold text-espresso tabular-nums">
            {fmtMoney(totalRefund)} refunded
          </div>
          <div className="mt-2 font-body text-sm text-espresso/70">
            Your card has been credited. No further action needed.
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="font-body text-[11px] font-extrabold uppercase tracking-[0.14em] text-espresso/60">
            Your contributions
          </div>
          <ContributionsTable
            commitments={group.commitments}
            bagChargesByCommitmentId={group.bagChargesByCommitmentId}
          />
        </div>
      </div>
    );
  }

  // Value mode — picked_up | done. The kg axis here must match `paid` so a
  // partial-fill commit doesn't overstate "saved" by including unsettled kg
  // in the baseline calculation. `commitmentDisplayKg` returns the locked
  // amount post-settle and the pledge pre-settle.
  const basePrice = Number(lot?.price_per_kg || 0);
  const baseWithFee = basePrice > 0 ? addPlatformFee(basePrice) : 0;
  const baselinePaid = succeeded.reduce(
    (s, c) => s + baseWithFee * commitmentDisplayKg(c),
    0
  );
  const saved = Math.max(0, baselinePaid - paid);

  // Find which tier the campaign settled at — the highest one whose threshold
  // was met by the final committed quantity. `getTierProgress` mirrors the
  // bag-aware settlement rule for display.
  const finalCommitted = Number(lot?.committed_quantity_kg || 0);
  const settledProgress = getTierProgress(
    {
      committed_quantity_kg: finalCommitted,
      price_per_kg: Number(lot?.price_per_kg || 0),
      bag_size_kg: lot?.bag_size_kg ?? null,
    },
    tiers
  );
  const settledTier = settledProgress.currentTier;
  const finalBuyerPrice = settledTier
    ? addPlatformFee(settledTier.price_per_kg)
    : null;

  return (
    <div className="flex flex-col gap-5" data-testid="closed-drawer-body">
      <div
        className="rounded-md border-[3px] border-espresso bg-chalk p-5"
        data-testid="closed-drawer-header"
      >
        {saved > 0 && (
          <>
            <div className="font-body text-[11px] font-extrabold uppercase tracking-[0.14em] text-matcha">
              You saved
            </div>
            <div
              className="mt-1 font-headline text-3xl font-bold text-matcha tabular-nums"
              data-testid="closed-savings"
            >
              {fmtMoney(saved)}
            </div>
          </>
        )}
        <div
          className={`font-body text-[11px] font-extrabold uppercase tracking-[0.14em] text-espresso/60 ${
            saved > 0 ? "mt-3" : ""
          }`}
        >
          You received
        </div>
        <div
          className="mt-1 font-headline text-3xl font-bold text-espresso tabular-nums"
          data-testid="closed-quantity"
        >
          <UnitWeightText kg={totalKg} maximumFractionDigits={1} />
        </div>
      </div>

      {settledTier && finalBuyerPrice != null && (
        <div
          className="rounded-md border-2 border-matcha bg-matcha/10 px-4 py-3"
          data-testid="closed-tier-summary"
        >
          <div className="font-body text-[11px] font-extrabold uppercase tracking-[0.14em] text-matcha">
            Tier unlocked
          </div>
          <div
            className="mt-1 font-body text-sm text-espresso"
            data-testid="closed-tier-threshold"
          >
            <span className="font-bold tabular-nums">
              {settledProgress.isBagAware && settledTier.min_bags !== null ? (
                <>{settledTier.min_bags} bag{settledTier.min_bags === 1 ? "" : "s"}</>
              ) : (
                <UnitWeightText
                  kg={settledTier.threshold_kg}
                  maximumFractionDigits={0}
                />
              )}
            </span>{" "}
            tier · final price{" "}
            <span className="font-bold tabular-nums">
              <UnitPriceText
                pricePerKg={settledTier.price_per_kg}
                currency="USD"
                includePlatformFee
              />
            </span>
          </div>
        </div>
      )}

      {creditAppliedDollars > 0 && (
        <div
          className="rounded-md border-2 border-sun bg-sun/15 px-4 py-3"
          data-testid="closed-inviter-credit"
        >
          <div className="font-body text-[11px] font-extrabold uppercase tracking-[0.14em] text-espresso">
            Inviter credit redeemed
          </div>
          <div className="mt-1 font-headline text-2xl font-bold text-espresso tabular-nums">
            -{fmtMoney(creditAppliedDollars)}
          </div>
          <div className="mt-1 font-body text-sm text-espresso/70">
            Refunded to your card. Sellers and your hub still receive the
            full amount — CrowdRoast covers the credit.
          </div>
        </div>
      )}

      <BagBreakdown
        commitments={group.commitments}
        bagChargesByCommitmentId={group.bagChargesByCommitmentId ?? {}}
      />

      <div className="flex flex-col gap-2">
        <div className="font-body text-[11px] font-extrabold uppercase tracking-[0.14em] text-espresso/60">
          Your contributions
        </div>
        <ContributionsTable
            commitments={group.commitments}
            bagChargesByCommitmentId={group.bagChargesByCommitmentId}
          />
      </div>
    </div>
  );
}

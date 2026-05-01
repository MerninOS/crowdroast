import { addPlatformFee } from "@/lib/pricing";
import { UnitPriceText, UnitWeightText } from "@/components/unit-value";
import { ContributionsTable } from "./contributions-table";
import { refundDollarsFor } from "./refund-amount";
import type { CommitmentGroup } from "../bucket-by-lifecycle";

export interface ClosedDrawerBodyProps {
  group: CommitmentGroup;
  /**
   * "value" — picked_up | done. Lead with savings + qty.
   * "refund" — minimum_not_met. Lead with refund total, suppress savings/CTA.
   */
  mode: "value" | "refund";
  tiers?: { min_quantity_kg: number; price_per_kg: number }[];
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

  const succeeded = group.commitments.filter(
    (c) => c.payment_status === "charge_succeeded" && c.status !== "cancelled"
  );
  const totalKg = succeeded.reduce((s, c) => s + Number(c.quantity_kg || 0), 0);
  const paid = succeeded.reduce(
    (s, c) =>
      s +
      (c.charge_amount_cents != null
        ? c.charge_amount_cents / 100
        : Number(c.total_price || 0)),
    0
  );
  const totalRefund = group.commitments.reduce(
    (s, c) => s + refundDollarsFor(c),
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
          <ContributionsTable commitments={group.commitments} />
        </div>
      </div>
    );
  }

  // Value mode — picked_up | done
  const basePrice = Number(lot?.price_per_kg || 0);
  const baseWithFee = basePrice > 0 ? addPlatformFee(basePrice) : 0;
  const baselinePaid = succeeded.reduce(
    (s, c) => s + baseWithFee * Number(c.quantity_kg || 0),
    0
  );
  const saved = Math.max(0, baselinePaid - paid);

  // Find which tier the campaign settled at — the highest one whose threshold
  // was met by the final committed quantity.
  const finalCommitted = Number(lot?.committed_quantity_kg || 0);
  const sortedTiers = [...tiers].sort(
    (a, b) => Number(a.min_quantity_kg) - Number(b.min_quantity_kg)
  );
  const unlockedTiers = sortedTiers.filter(
    (t) => finalCommitted >= Number(t.min_quantity_kg)
  );
  const settledTier = unlockedTiers[unlockedTiers.length - 1] ?? null;
  const finalBuyerPrice = settledTier
    ? addPlatformFee(Number(settledTier.price_per_kg))
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
              <UnitWeightText
                kg={Number(settledTier.min_quantity_kg)}
                maximumFractionDigits={0}
              />
            </span>{" "}
            tier · final price{" "}
            <span className="font-bold tabular-nums">
              <UnitPriceText
                pricePerKg={Number(settledTier.price_per_kg)}
                currency="USD"
                includePlatformFee
              />
            </span>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="font-body text-[11px] font-extrabold uppercase tracking-[0.14em] text-espresso/60">
          Your contributions
        </div>
        <ContributionsTable commitments={group.commitments} />
      </div>
    </div>
  );
}

import { ChevronRight } from "lucide-react";
import { CommitmentPickupButton } from "@/components/commitment-pickup-button";
import { UnitWeightText } from "@/components/unit-value";
import { LifecycleTrack } from "./lifecycle-track";
import {
  effectiveChargeState,
  effectiveChargedCents,
  stageOfGroup,
  type CommitmentGroup,
} from "./bucket-by-lifecycle";
import { commitmentDisplayKg } from "@/lib/commitment-kg";

export interface InMotionLotCardProps {
  group: CommitmentGroup;
  onSelect?: () => void;
  triggerRef?: React.Ref<HTMLButtonElement>;
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);

function fmtRelDays(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  const d = Math.round(ms / 86_400_000);
  if (d === 0) return "today";
  if (d > 0) return `in ${d}d`;
  return `${-d}d ago`;
}

export function InMotionLotCard({ group, onSelect, triggerRef }: InMotionLotCardProps) {
  const lot = group.lot;
  const stage = stageOfGroup(group);
  // Surface every non-cancelled commit, not just legacy `charge_succeeded`
  // rows. Bag-aware commits stay at `setup_complete` even after settlement
  // and through "in motion" — the truth of "is this commitment locked in"
  // lives on `kg_locked_at_settlement` (set by settle-deadlines once the
  // campaign settles).
  const live = group.commitments.filter((c) => c.status !== "cancelled");
  // "My weight" is what was AGREED — quantity_kg pre-settle, the actual
  // allocated kg_locked_at_settlement post-settle. Reads via
  // `commitmentDisplayKg` so the bag-aware-rounded amount shows up
  // correctly when the buyer's pledge didn't fill a whole bag.
  const myKg = live.reduce((s, c) => s + commitmentDisplayKg(c), 0);
  // Paid = cents that actually moved on Stripe. Sums bag charges for
  // bag-aware commits; falls back to legacy `charge_amount_cents` for
  // payment-mode commits. Same semantics as `effectiveChargedCents` in
  // the portfolio strip math.
  const paidCents = live.reduce(
    (s, c) => s + effectiveChargedCents(c, group.bagChargesByCommitmentId?.[c.id]),
    0
  );
  const paid = paidCents / 100;
  // Billed = gross before refunds. For bag-aware this is locked_kg × price
  // before any failed-bag credit; for legacy it's the commitment.total_price.
  const billed = live.reduce((s, c) => s + Number(c.total_price || 0), 0);
  const refunded = Math.max(0, billed - paid);
  const settlementFailed = lot?.settlement_status === "failed";

  // Pickup button targets any commit at the at-hub stage. Prefer one that's
  // confirmed-and-paid (effective state succeeded) since those are the
  // commits eligible to pick up; fall back to the first live one.
  const pickupCommitmentId =
    live.find(
      (c) =>
        effectiveChargeState(c, group.bagChargesByCommitmentId?.[c.id]) ===
        "succeeded"
    )?.id ?? live[0]?.id ?? group.commitments[0]?.id;

  let nextEvent: string | null = null;
  if (stage === "in_transit") {
    nextEvent = group.shipment?.delivered_at ? `Landed ${fmtRelDays(group.shipment.delivered_at)}` : "Sailing to your hub";
  } else if (stage === "at_hub") {
    nextEvent = group.shipment?.delivered_at ? `Landed ${fmtRelDays(group.shipment.delivered_at)}` : "Ready for pickup";
  } else if (stage === "funds_held") {
    nextEvent = group.shipment?.shipped_at ? `Shipped ${fmtRelDays(group.shipment.shipped_at)}` : "Awaiting shipment";
  }

  return (
    <div className="rounded-[14px] border-[3px] border-espresso bg-chalk p-5 shadow-flat-md">
      <div className="mb-3.5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="font-headline text-[10px] font-extrabold uppercase tracking-[0.18em] text-espresso/60">
            {(lot?.region || lot?.origin_country || "").toString().toUpperCase()}
            {lot?.region && lot?.origin_country ? ` · ${lot.origin_country.toUpperCase()}` : ""}
          </div>
          {onSelect ? (
            <button
              ref={triggerRef}
              type="button"
              onClick={onSelect}
              data-testid={`in-motion-card-trigger-${group.groupKey}`}
              className="mt-1 inline-flex items-center gap-1.5 text-left font-headline text-[20px] font-bold leading-tight text-espresso transition-colors hover:text-tomato focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tomato focus-visible:ring-offset-2 focus-visible:ring-offset-chalk rounded-sm"
            >
              {lot?.title || "Unknown lot"}
              <ChevronRight className="h-4 w-4 shrink-0 text-espresso/55" strokeWidth={2.5} />
            </button>
          ) : (
            <div className="mt-1 font-headline text-[20px] font-bold leading-tight text-espresso">
              {lot?.title || "Unknown lot"}
            </div>
          )}
          <div className="mt-1 font-headline text-xs text-espresso/60">
            <UnitWeightText kg={myKg} maximumFractionDigits={0} /> · {fmtMoney(paid)} settled
            {refunded > 0 && (
              <span className="font-bold text-matcha"> · refunded {fmtMoney(refunded)}</span>
            )}
          </div>
        </div>
        <div className="text-left sm:text-right">
          {nextEvent && (
            <>
              <div className="font-headline text-[9px] font-extrabold uppercase tracking-[0.18em] text-espresso/55">
                Next event
              </div>
              <div className="mt-0.5 font-headline text-sm font-extrabold text-espresso">{nextEvent}</div>
            </>
          )}
          {(group.shipment?.carrier || group.shipment?.tracking_number) && (
            <div className="mt-1 font-headline text-[11px] text-espresso/60">
              {group.shipment.carrier}
              {group.shipment.carrier && group.shipment.tracking_number ? " · " : ""}
              {group.shipment.tracking_number}
            </div>
          )}
          {group.shipment?.hub?.name && (
            <div className="mt-1 font-headline text-[11px] text-espresso/60">{group.shipment.hub.name}</div>
          )}
        </div>
      </div>

      <LifecycleTrack stage={stage} dense />

      {settlementFailed && (
        <div className="mt-3 rounded border-2 border-tomato bg-tomato/10 px-3 py-2 font-headline text-xs font-bold text-tomato">
          Settlement retrying — we'll keep you posted.
        </div>
      )}

      {stage === "at_hub" && pickupCommitmentId && (
        <div className="mt-3.5 flex flex-col gap-3 border-t-2 border-dashed border-espresso/20 pt-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="font-headline text-xs text-espresso">
            <span className="font-extrabold">Ready for pickup</span>
            {group.shipment?.hub?.name && <span className="text-espresso/60"> · {group.shipment.hub.name}</span>}
          </div>
          <CommitmentPickupButton
            commitmentId={pickupCommitmentId}
            alreadyPickedUp={false}
            variant="matcha"
            size="sm"
            label="✓ Mark as picked up"
          />
        </div>
      )}
    </div>
  );
}

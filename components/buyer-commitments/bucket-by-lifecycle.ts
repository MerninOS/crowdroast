import type { Campaign, Commitment, Lot, Shipment } from "@/lib/types";
import type { BagChargeRow } from "./commitment-drawer/bag-breakdown";

export type LifecycleStage =
  | "raising"
  | "funds_held"
  | "in_transit"
  | "at_hub"
  | "picked_up"
  | "done"
  | "minimum_not_met";

export type StageColor = "tomato" | "honey" | "sky" | "sun" | "matcha" | "fog" | "espresso";

export interface StageMeta {
  label: string;
  step: number;
  color: StageColor;
  desc: string;
}

export const STAGE_META: Record<LifecycleStage, StageMeta> = {
  raising:         { label: "Raising",         step: 1, color: "tomato",   desc: "Commits open" },
  funds_held:      { label: "Funds Held",      step: 2, color: "honey",    desc: "Settled, awaiting ship" },
  in_transit:      { label: "In Transit",      step: 3, color: "sky",      desc: "Sailing to your hub" },
  at_hub:          { label: "At Hub",          step: 4, color: "sun",      desc: "Ready for pickup" },
  picked_up:       { label: "Picked Up",       step: 5, color: "matcha",   desc: "In your possession" },
  done:            { label: "Done",            step: 6, color: "fog",      desc: "Closed in the books" },
  minimum_not_met: { label: "Min Not Met",     step: 0, color: "espresso", desc: "Refunded — didn't hit minimum" },
};

export const LIFECYCLE_STEPS: { key: LifecycleStage; label: string }[] = [
  { key: "raising",    label: "Raising" },
  { key: "funds_held", label: "Funds Held" },
  { key: "in_transit", label: "In Transit" },
  { key: "at_hub",     label: "At Hub" },
  { key: "picked_up",  label: "Picked Up" },
  { key: "done",       label: "Done" },
];

export interface CommitmentGroup {
  groupKey: string;
  lotId: string;
  campaignId: string | null;
  hubId: string | null;
  lot: Lot | null;
  campaign: Pick<Campaign, "id" | "status" | "deadline" | "settled_at"> | null;
  commitments: Commitment[];
  shipment: Pick<Shipment, "status" | "carrier" | "tracking_number" | "shipped_at" | "delivered_at"> & { hub?: { name: string } | null } | null;
  // commit_applied credit_ledger amounts in cents (stored as a positive
  // number for UI). Keyed by commitment_id; absent when no credit applied.
  // Populated server-side at /dashboard/buyer/commitments and used by the
  // closed drawer to surface the inviter-credit line.
  creditAppliedByCommitmentId?: Record<string, number>;
  // commitment_bag_charges rows owned by the buyer for each commitment in
  // this group, keyed by commitment_id. Populated server-side at
  // /dashboard/buyer/commitments (scoped by RLS to the buyer); used by the
  // closed-value drawer body to render the per-bag breakdown. Absent or
  // empty array means no bag-charges have been created (legacy lot, or
  // campaign that failed minimum and never reached bag-charge creation).
  bagChargesByCommitmentId?: Record<string, BagChargeRow[]>;
}

export interface BucketedGroups {
  needsAttention: CommitmentGroup[];
  raising: CommitmentGroup[];
  inMotion: CommitmentGroup[];
  closed: CommitmentGroup[];
}

const NOW = () => Date.now();

function deadlineInFuture(group: CommitmentGroup): boolean {
  // Prefer the campaign deadline (each campaign instance has its own clock);
  // fall back to the lot's legacy commitment_deadline for pre-campaign data.
  const deadline = group.campaign?.deadline ?? group.lot?.commitment_deadline;
  if (!deadline) return false;
  return new Date(deadline).getTime() > NOW();
}

function anyPickedUp(group: CommitmentGroup): boolean {
  return group.commitments.some((c) => c.picked_up_at != null);
}

// -------------------------------------------------------------------------
// Effective payment state — bag-aware vs legacy
// -------------------------------------------------------------------------
// Bag-aware commitments (migration #38 onward) leave the commitment-level
// `payment_status` parked at `'setup_complete'` forever. The real
// charge state lives in `commitment_bag_charges` rows, one per bag.
// Every consumer that used to read `commitment.payment_status === 'charge_succeeded'`
// or `'charge_failed'` will silently get the wrong answer for bag-aware
// commitments. These helpers wrap that derivation in one place so both
// the bucket-classifier (`hasChargeFailed`) and the portfolio-stat math
// agree on the effective state.

export type EffectiveChargeState =
  | "succeeded"        // bag-aware: every bag row is `charged`. Legacy: `charge_succeeded`.
  | "failed"           // bag-aware: at least one bag row is `payment_failed`. Legacy: `charge_failed`.
  | "in_flight"        // bag-aware: bag rows exist but none failed yet AND not all charged.
  | "pre_settlement";  // no bag rows yet, no legacy success/fail signal (setup_complete, pending_setup, cancelled, …).

/**
 * Resolve a commitment's effective charge state by looking at its bag rows
 * first, falling back to the legacy commitment-level field. A `payment_failed`
 * bag short-circuits to `failed` so a partial failure surfaces in
 * needsAttention immediately — buyers shouldn't have to wait for the
 * remaining bags to finish the retry ladder.
 */
export function effectiveChargeState(
  commitment: Pick<Commitment, "payment_status">,
  bagCharges: BagChargeRow[] | undefined
): EffectiveChargeState {
  if (bagCharges && bagCharges.length > 0) {
    if (bagCharges.some((b) => b.payment_status === "payment_failed")) {
      return "failed";
    }
    if (bagCharges.every((b) => b.payment_status === "charged")) {
      return "succeeded";
    }
    return "in_flight";
  }
  if (commitment.payment_status === "charge_succeeded") return "succeeded";
  if (commitment.payment_status === "charge_failed") return "failed";
  return "pre_settlement";
}

/**
 * Cents the buyer actually paid for this commitment. Sums the `charged`
 * bag rows for bag-aware commits; for legacy commits returns the
 * commitment-level `charge_amount_cents` (which Stripe updates on refunds,
 * so this is already net spend) when the row is in a terminal-success
 * state — `0` otherwise.
 */
export function effectiveChargedCents(
  commitment: Pick<Commitment, "payment_status" | "charge_amount_cents">,
  bagCharges: BagChargeRow[] | undefined
): number {
  if (bagCharges && bagCharges.length > 0) {
    return bagCharges
      .filter((b) => b.payment_status === "charged")
      .reduce((acc, b) => acc + (b.amount_cents || 0), 0);
  }
  return commitment.payment_status === "charge_succeeded"
    ? Number(commitment.charge_amount_cents ?? 0)
    : 0;
}

/**
 * Kg the buyer secured for this commitment — the unit-side analog of
 * `effectiveChargedCents`. For bag-aware commits sums the kg of `charged`
 * bag rows so an in-flight commit's "Landing Soon" weight only reflects
 * the bags whose money has actually moved. Legacy commits return the
 * commitment's `quantity_kg` when the row is in terminal-success state.
 */
export function effectiveChargedKg(
  commitment: Pick<Commitment, "payment_status" | "quantity_kg">,
  bagCharges: BagChargeRow[] | undefined
): number {
  if (bagCharges && bagCharges.length > 0) {
    return bagCharges
      .filter((b) => b.payment_status === "charged")
      .reduce((acc, b) => acc + (b.kg || 0), 0);
  }
  return commitment.payment_status === "charge_succeeded"
    ? Number(commitment.quantity_kg || 0)
    : 0;
}

/**
 * Most-recent "money moved" timestamp for this commitment, in ms since
 * epoch — used by YTD spend to decide which calendar year to attribute the
 * spend to. Returns `null` when the commitment hasn't been charged at all
 * (no charged bag rows AND no legacy `charged_at`), in which case the
 * caller should exclude it from year-bucketing entirely.
 */
export function effectiveChargedAtMs(
  commitment: Pick<Commitment, "payment_status" | "charged_at">,
  bagCharges: BagChargeRow[] | undefined
): number | null {
  if (bagCharges && bagCharges.length > 0) {
    const charged = bagCharges.filter((b) => b.payment_status === "charged");
    if (charged.length === 0) return null;
    // updated_at is the closest available proxy for the worker's
    // moment-of-charge — the same write flipped payment_status to 'charged'
    // and bumped updated_at via the trigger. Max across the bag rows
    // attributes the commitment to the year of its LAST successful bag.
    return charged.reduce(
      (acc, b) => Math.max(acc, new Date(b.updated_at).getTime()),
      0
    );
  }
  if (commitment.payment_status === "charge_succeeded" && commitment.charged_at) {
    return new Date(commitment.charged_at).getTime();
  }
  return null;
}

function hasChargeFailed(group: CommitmentGroup): boolean {
  return group.commitments.some(
    (c) =>
      effectiveChargeState(c, group.bagChargesByCommitmentId?.[c.id]) ===
      "failed"
  );
}

/**
 * Map a (lot × campaign) group to its lifecycle stage.
 *
 * Whenever a `campaign` is present, the campaign's own status is the
 * authoritative source for THIS group. The lot-level `settlement_status`
 * reflects only the *most recent* campaign's outcome (the lot is a shared
 * surface across multiple campaigns) — using it would poison every group
 * for that lot with the latest campaign's state. We only fall back to
 * lot-level state for legacy commitments that pre-date the campaigns table.
 */
export function stageOfGroup(group: CommitmentGroup): LifecycleStage {
  const campaignStatus = group.campaign?.status;

  if (campaignStatus) {
    if (campaignStatus === "failed" || campaignStatus === "cancelled") {
      return "minimum_not_met";
    }
    if (campaignStatus === "active") {
      // Open for commits if the campaign deadline is still in the future;
      // otherwise the deadline has passed and we're awaiting the settle cron.
      return deadlineInFuture(group) ? "raising" : "funds_held";
    }
    // campaignStatus === "settled" — progress along the shipment timeline.
    if (anyPickedUp(group)) return "picked_up";
    const shipStatus = group.shipment?.status;
    if (shipStatus === "in_transit") return "in_transit";
    if (shipStatus === "at_hub" || shipStatus === "out_for_delivery" || shipStatus === "delivered") return "at_hub";
    return "funds_held";
  }

  // Legacy fallback (no campaign on the group) — read lot-level state.
  const settlement = group.lot?.settlement_status;
  if (settlement === "minimum_not_met") return "minimum_not_met";
  if (settlement === "pending" && deadlineInFuture(group)) return "raising";
  if (anyPickedUp(group)) return "picked_up";
  const shipStatus = group.shipment?.status;
  if (shipStatus === "in_transit") return "in_transit";
  if (shipStatus === "at_hub" || shipStatus === "out_for_delivery" || shipStatus === "delivered") return "at_hub";
  return "funds_held";
}

export function bucketByLifecycle(groups: CommitmentGroup[]): BucketedGroups {
  const needsAttention = groups.filter(hasChargeFailed);

  const cycleGroups = groups; // charge_failed groups still bucket normally per spec C6
  const raising: CommitmentGroup[] = [];
  const inMotion: CommitmentGroup[] = [];
  const closed: CommitmentGroup[] = [];

  for (const g of cycleGroups) {
    const stage = stageOfGroup(g);
    if (stage === "raising") raising.push(g);
    else if (stage === "funds_held" || stage === "in_transit" || stage === "at_hub") inMotion.push(g);
    else closed.push(g); // picked_up, done, minimum_not_met
  }

  // Within-section sort (spec C8)
  raising.sort((a, b) => {
    const ad = a.lot?.commitment_deadline ? new Date(a.lot.commitment_deadline).getTime() : Infinity;
    const bd = b.lot?.commitment_deadline ? new Date(b.lot.commitment_deadline).getTime() : Infinity;
    return ad - bd || a.lotId.localeCompare(b.lotId);
  });
  inMotion.sort((a, b) => {
    const sa = STAGE_META[stageOfGroup(a)].step;
    const sb = STAGE_META[stageOfGroup(b)].step;
    return sa - sb || a.lotId.localeCompare(b.lotId);
  });
  closed.sort((a, b) => {
    const ad = closedDateOf(a);
    const bd = closedDateOf(b);
    return bd - ad || a.lotId.localeCompare(b.lotId);
  });

  return { needsAttention, raising, inMotion, closed };
}

function closedDateOf(g: CommitmentGroup): number {
  const pickedUp = g.commitments
    .map((c) => c.picked_up_at)
    .filter((d): d is string => !!d)
    .map((d) => new Date(d).getTime());
  if (pickedUp.length) return Math.max(...pickedUp);
  if (g.lot?.settlement_processed_at) return new Date(g.lot.settlement_processed_at).getTime();
  const created = g.commitments.map((c) => new Date(c.created_at).getTime());
  return created.length ? Math.max(...created) : 0;
}

export interface PortfolioStats {
  liveExposure: number;
  landingKg: number;
  savedVsBase: number;
  ytdSpend: number;
  liveCount: number;
  inMotionCount: number;
}

/**
 * Derive the portfolio strip values from grouped commitments.
 *
 * Math contract (spec § C5):
 * - Live Exposure = Σ qty × commit_price × (1 + platform fee) over RAISING groups, excluding terminally-failed commitments
 * - Landing Soon = Σ kg actually charged over funds_held + in_transit + at_hub
 * - Saved via Tiers = Σ max(0, (committed_avg − final_price) × secured_kg) over settled groups
 * - YTD Spend = Σ (paid − refunded) per commitment whose money moved this calendar year, excluding terminally-failed
 *
 * Bag-aware vs legacy: every per-commitment read goes through the
 * `effective*` helpers above, which sum `commitment_bag_charges` rows
 * when present and fall back to the legacy commitment-level columns
 * otherwise. Without that, every bag-aware lot would show $0 in
 * Landing Soon / Saved via Tiers / YTD Spend because the legacy
 * `payment_status` stays at `'setup_complete'` and `charge_amount_cents`
 * stays NULL for those commitments.
 */
export function derivePortfolioStats(
  groups: CommitmentGroup[],
  addPlatformFee: (pricePerKg: number) => number
): PortfolioStats {
  const buckets = bucketByLifecycle(groups);
  const ytStart = new Date(new Date().getFullYear(), 0, 1).getTime();

  const liveExposure = buckets.raising.reduce((sum, g) => {
    return (
      sum +
      g.commitments
        .filter((c) => {
          if (c.status === "cancelled") return false;
          // Drop commits whose effective state is already terminal-failed
          // (covers legacy `charge_failed` AND bag-aware "any bag failed").
          const state = effectiveChargeState(
            c,
            g.bagChargesByCommitmentId?.[c.id]
          );
          return state !== "failed";
        })
        .reduce(
          (acc, c) =>
            acc + Number(c.quantity_kg) * addPlatformFee(Number(c.price_per_kg)),
          0
        )
    );
  }, 0);

  const landingKg = buckets.inMotion.reduce((sum, g) => {
    return (
      sum +
      g.commitments.reduce((acc, c) => {
        // For bag-aware commits sums the kg of `charged` rows only —
        // partial successes contribute only the bags whose money moved.
        return acc + effectiveChargedKg(c, g.bagChargesByCommitmentId?.[c.id]);
      }, 0)
    );
  }, 0);

  // Saved via Tiers — for each successfully-charged commitment, compare what
  // the buyer would have paid at the lot's BASE price (lot.price_per_kg, with
  // platform fee) against what they actually paid. For bag-aware commits the
  // "actually paid" leg sums charged-bag amount_cents; the "would have paid"
  // leg uses the kg actually charged so we compare apples to apples (a
  // partially-failed commit shouldn't claim savings on the dropped bags).
  const savedVsBase = groups.reduce((sum, g) => {
    const basePrice = g.lot ? Number(g.lot.price_per_kg) : 0;
    if (basePrice <= 0) return sum;
    const baseWithFee = addPlatformFee(basePrice);
    return (
      sum +
      g.commitments.reduce((acc, c) => {
        if (c.status === "cancelled") return acc;
        const bags = g.bagChargesByCommitmentId?.[c.id];
        const state = effectiveChargeState(c, bags);
        if (state !== "succeeded" && state !== "in_flight") return acc;
        const chargedKg = effectiveChargedKg(c, bags);
        if (chargedKg <= 0) return acc;
        const chargedCents = effectiveChargedCents(c, bags);
        const actualPaid =
          bags && bags.length > 0
            ? chargedCents / 100
            : c.charge_amount_cents != null
              ? c.charge_amount_cents / 100
              : Number(c.total_price || 0);
        const wouldHavePaid = baseWithFee * chargedKg;
        return acc + Math.max(0, wouldHavePaid - actualPaid);
      }, 0)
    );
  }, 0);

  const ytdSpend = groups.reduce((sum, g) => {
    return (
      sum +
      g.commitments.reduce((acc, c) => {
        const bags = g.bagChargesByCommitmentId?.[c.id];
        const chargedAtMs = effectiveChargedAtMs(c, bags);
        if (chargedAtMs == null) return acc;
        if (chargedAtMs < ytStart) return acc;
        // For bag-aware commits sum amount_cents across `charged` rows;
        // for legacy fall through to the commitment-level field. Both
        // are already net of refunds (Stripe updates the underlying
        // value on partial/full refund).
        const chargedCents = effectiveChargedCents(c, bags);
        const paid =
          bags && bags.length > 0
            ? chargedCents / 100
            : c.charge_amount_cents != null
              ? c.charge_amount_cents / 100
              : Number(c.total_price || 0);
        return acc + paid;
      }, 0)
    );
  }, 0);

  return {
    liveExposure,
    landingKg,
    savedVsBase,
    ytdSpend,
    liveCount: buckets.raising.length,
    inMotionCount: buckets.inMotion.length,
  };
}

/**
 * Tests for bucket-by-lifecycle — the spec § C5 math contract and § C7/C8
 * bucketing/sort rules. Pure-function tests; no React, no jsdom.
 *
 * Failure cases caught:
 * - charge_failed leaking into Live Exposure or YTD Spend
 * - YTD Spend not netting refunds (returns gross instead of net)
 * - Two campaigns for the same lot collapsing into one group
 * - Raising sort defaulting to insertion order instead of deadline asc
 * - Closed bucket missing minimum_not_met
 */

import { describe, it, expect } from "vitest";
import {
  bucketByLifecycle,
  derivePortfolioStats,
  stageOfGroup,
  effectiveChargeState,
  effectiveChargedCents,
  effectiveChargedKg,
  deriveNeedsAttentionDisplay,
  type CommitmentGroup,
} from "../bucket-by-lifecycle";
import type { BagChargeRow } from "../commitment-drawer/bag-breakdown";
import type { Commitment, Lot } from "@/lib/types";

const NOOP_FEE = (p: number) => p;

const dayOffset = (d: number) =>
  new Date(Date.now() + d * 24 * 60 * 60 * 1000).toISOString();

let cId = 0;
const mkCommit = (over: Partial<Commitment> = {}): Commitment => {
  cId += 1;
  const base: Commitment = {
    id: `c-${cId}`,
    lot_id: "lot-x",
    buyer_id: "buyer-1",
    hub_id: null,
    campaign_id: "camp-1",
    quantity_kg: 100,
    price_per_kg: 10,
    total_price: 1000,
    status: "confirmed",
    payment_status: "charge_succeeded",
    charge_amount_cents: 100000,
    charge_currency: "usd",
    stripe_checkout_session_id: null,
    stripe_setup_intent_id: null,
    stripe_payment_method_id: null,
    stripe_customer_id: null,
    stripe_payment_intent_id: "pi-x",
    stripe_charge_id: null,
    payment_error: null,
    charged_at: new Date().toISOString(),
    notes: null,
    picked_up_at: null,
    picked_up_by: null,
    kg_locked_at_settlement: null,
    kg_refunded_at_settlement: null,
    settlement_email_sent_at: null,
    refund_status: "not_refunded",
    refunded_amount_cents: 0,
    refunded_at: null,
    refunded_by: null,
    last_refund_id: null,
    refund_reason: null,
    created_at: dayOffset(-30),
    updated_at: new Date().toISOString(),
  };
  return { ...base, ...over };
};

const mkLot = (over: Partial<Lot> = {}): Lot => ({
  id: "lot-x",
  seller_id: "seller-1",
  hub_id: null,
  title: "Test Lot",
  origin_country: "Ethiopia",
  region: null,
  farm: null,
  variety: null,
  process: null,
  altitude_min: null,
  altitude_max: null,
  crop_year: null,
  score: null,
  description: null,
  total_quantity_kg: 1500,
  committed_quantity_kg: 1000,
  min_commitment_kg: 800,
  bag_size_kg: null,
  min_bags_to_succeed: 1,
  price_per_kg: 10,
  currency: "usd",
  status: "active" as Lot["status"],
  commitment_deadline: dayOffset(2),
  expiry_date: null,
  settlement_status: "pending",
  settlement_processed_at: null,
  images: [],
  flavor_notes: [],
  certifications: [],
  created_at: dayOffset(-60),
  updated_at: new Date().toISOString(),
  ...over,
});

const mkGroup = (over: Partial<CommitmentGroup> = {}): CommitmentGroup => ({
  groupKey: "camp-1",
  lotId: "lot-x",
  campaignId: "camp-1",
  lot: mkLot(),
  campaign: null,
  commitments: [mkCommit()],
  shipment: null,
  ...over,
});

describe("stageOfGroup", () => {
  it("classifies raising when settlement is pending and deadline is in the future", () => {
    const g = mkGroup({ lot: mkLot({ settlement_status: "pending", commitment_deadline: dayOffset(3) }) });
    expect(stageOfGroup(g)).toBe("raising");
  });

  it("classifies funds_held when settled and no shipment", () => {
    const g = mkGroup({ lot: mkLot({ settlement_status: "settled" }), shipment: null });
    expect(stageOfGroup(g)).toBe("funds_held");
  });

  it("classifies in_transit from shipment status", () => {
    const g = mkGroup({
      lot: mkLot({ settlement_status: "settled" }),
      shipment: { status: "in_transit", carrier: null, tracking_number: null, shipped_at: null, delivered_at: null, hub: null },
    });
    expect(stageOfGroup(g)).toBe("in_transit");
  });

  it.each(["at_hub", "out_for_delivery", "delivered"] as const)(
    "classifies at_hub for shipment status %s",
    (status) => {
      const g = mkGroup({
        lot: mkLot({ settlement_status: "settled" }),
        shipment: { status, carrier: null, tracking_number: null, shipped_at: null, delivered_at: null, hub: null },
      });
      expect(stageOfGroup(g)).toBe("at_hub");
    }
  );

  it("classifies picked_up when any commitment has picked_up_at", () => {
    const g = mkGroup({
      lot: mkLot({ settlement_status: "settled" }),
      shipment: { status: "delivered", carrier: null, tracking_number: null, shipped_at: null, delivered_at: null, hub: null },
      commitments: [mkCommit({ picked_up_at: dayOffset(-1) })],
    });
    expect(stageOfGroup(g)).toBe("picked_up");
  });

  it("classifies minimum_not_met regardless of other signals", () => {
    const g = mkGroup({ lot: mkLot({ settlement_status: "minimum_not_met" }) });
    expect(stageOfGroup(g)).toBe("minimum_not_met");
  });

  it("classifies a failed campaign as terminated even if the lot has been re-launched and settled", () => {
    // Realistic case: the lot has a NEW campaign that succeeded — the new
    // campaign sits in 'funds_held'. The OLD failed campaign for the same
    // lot must NOT inherit the lot's current settled state.
    const g = mkGroup({
      campaignId: "camp-old",
      campaign: { id: "camp-old", status: "failed", deadline: dayOffset(-30), settled_at: null },
      lot: mkLot({ settlement_status: "settled" }),
    });
    expect(stageOfGroup(g)).toBe("minimum_not_met");
  });

  it("classifies a cancelled campaign as terminated", () => {
    const g = mkGroup({
      campaign: { id: "camp-1", status: "cancelled", deadline: dayOffset(-3), settled_at: null },
    });
    expect(stageOfGroup(g)).toBe("minimum_not_met");
  });

  it("classifies an active campaign whose deadline has passed as funds_held (awaiting settle cron)", () => {
    // Reproduces user-reported bug: a successful campaign whose deadline has
    // passed but the settle-deadlines cron hasn't run yet must NOT show
    // 'min not met'. It belongs in In Motion / funds_held.
    const g = mkGroup({
      campaign: { id: "camp-1", status: "active", deadline: dayOffset(-1), settled_at: null },
      lot: mkLot({ settlement_status: "pending", commitment_deadline: dayOffset(-1) }),
    });
    expect(stageOfGroup(g)).toBe("funds_held");
  });

  it("does not poison a successful new campaign with a stale lot.settlement_status from a prior failed campaign", () => {
    // A lot can be re-launched in a new campaign after the previous campaign
    // failed. The lot's settlement_status reflects the most-recent campaign's
    // outcome (here: 'minimum_not_met' from the prior campaign). The CURRENT
    // campaign for this group is settled, so the group must not inherit the
    // lot's stale terminal state.
    const g = mkGroup({
      campaignId: "camp-new",
      campaign: { id: "camp-new", status: "settled", deadline: dayOffset(-3), settled_at: dayOffset(-2) },
      lot: mkLot({ settlement_status: "minimum_not_met" }),
    });
    expect(stageOfGroup(g)).toBe("funds_held");
  });

  it("uses campaign deadline (not lot deadline) to classify raising", () => {
    // Lot's commitment_deadline is in the past, but the campaign's deadline
    // is in the future — raising should win.
    const g = mkGroup({
      campaign: { id: "camp-1", status: "active", deadline: dayOffset(5), settled_at: null },
      lot: mkLot({ settlement_status: "pending", commitment_deadline: dayOffset(-2) }),
    });
    expect(stageOfGroup(g)).toBe("raising");
  });
});

describe("bucketByLifecycle", () => {
  it("places raising / in_motion / closed groups in the right buckets", () => {
    const raising = mkGroup({
      groupKey: "g-r", lotId: "lot-r", campaignId: "g-r",
      lot: mkLot({ id: "lot-r", settlement_status: "pending", commitment_deadline: dayOffset(2) }),
    });
    const inFlight = mkGroup({
      groupKey: "g-t", lotId: "lot-t", campaignId: "g-t",
      lot: mkLot({ id: "lot-t", settlement_status: "settled" }),
      shipment: { status: "in_transit", carrier: null, tracking_number: null, shipped_at: null, delivered_at: null, hub: null },
    });
    const done = mkGroup({
      groupKey: "g-d", lotId: "lot-d", campaignId: "g-d",
      lot: mkLot({ id: "lot-d", settlement_status: "settled" }),
      commitments: [mkCommit({ picked_up_at: dayOffset(-90) })],
    });
    const refunded = mkGroup({
      groupKey: "g-m", lotId: "lot-m", campaignId: "g-m",
      lot: mkLot({ id: "lot-m", settlement_status: "minimum_not_met" }),
    });

    const out = bucketByLifecycle([done, raising, refunded, inFlight]);
    expect(out.raising.map((g) => g.lotId)).toEqual(["lot-r"]);
    expect(out.inMotion.map((g) => g.lotId)).toEqual(["lot-t"]);
    expect(out.closed.map((g) => g.lotId).sort()).toEqual(["lot-d", "lot-m"]);
  });

  it("surfaces charge_failed groups in needsAttention without removing them from cycle buckets", () => {
    const failedRaising = mkGroup({
      groupKey: "g-rf", lotId: "lot-rf", campaignId: "g-rf",
      lot: mkLot({ id: "lot-rf", settlement_status: "pending", commitment_deadline: dayOffset(1) }),
      commitments: [mkCommit({ payment_status: "charge_failed", charge_amount_cents: null, payment_error: "card declined" })],
    });
    const out = bucketByLifecycle([failedRaising]);
    expect(out.needsAttention.map((g) => g.lotId)).toEqual(["lot-rf"]);
    expect(out.raising.map((g) => g.lotId)).toEqual(["lot-rf"]);
  });

  it("sorts raising by deadline ascending, ties broken by lotId", () => {
    const a = mkGroup({ groupKey: "ga", lotId: "lot-a", lot: mkLot({ id: "lot-a", commitment_deadline: dayOffset(5) }) });
    const b = mkGroup({ groupKey: "gb", lotId: "lot-b", lot: mkLot({ id: "lot-b", commitment_deadline: dayOffset(1) }) });
    const c = mkGroup({ groupKey: "gc", lotId: "lot-c", lot: mkLot({ id: "lot-c", commitment_deadline: dayOffset(1) }) });
    const out = bucketByLifecycle([a, b, c]);
    expect(out.raising.map((g) => g.lotId)).toEqual(["lot-b", "lot-c", "lot-a"]);
  });

  it("sorts inMotion by lifecycle step, then by lotId", () => {
    const fundsHeld = mkGroup({
      groupKey: "gf", lotId: "lot-f",
      lot: mkLot({ id: "lot-f", settlement_status: "settled" }),
    });
    const inTransit = mkGroup({
      groupKey: "gt", lotId: "lot-t",
      lot: mkLot({ id: "lot-t", settlement_status: "settled" }),
      shipment: { status: "in_transit", carrier: null, tracking_number: null, shipped_at: null, delivered_at: null, hub: null },
    });
    const atHub = mkGroup({
      groupKey: "gh", lotId: "lot-h",
      lot: mkLot({ id: "lot-h", settlement_status: "settled" }),
      shipment: { status: "at_hub", carrier: null, tracking_number: null, shipped_at: null, delivered_at: null, hub: null },
    });
    const out = bucketByLifecycle([atHub, fundsHeld, inTransit]);
    expect(out.inMotion.map((g) => g.lotId)).toEqual(["lot-f", "lot-t", "lot-h"]);
  });

  it("sorts closed by most-recent activity descending", () => {
    const oldDone = mkGroup({
      groupKey: "g1", lotId: "lot-old",
      lot: mkLot({ id: "lot-old", settlement_status: "settled" }),
      commitments: [mkCommit({ picked_up_at: dayOffset(-180) })],
    });
    const newDone = mkGroup({
      groupKey: "g2", lotId: "lot-new",
      lot: mkLot({ id: "lot-new", settlement_status: "settled" }),
      commitments: [mkCommit({ picked_up_at: dayOffset(-2) })],
    });
    const out = bucketByLifecycle([oldDone, newDone]);
    expect(out.closed.map((g) => g.lotId)).toEqual(["lot-new", "lot-old"]);
  });

  it("treats empty input as four empty buckets", () => {
    const out = bucketByLifecycle([]);
    expect(out).toEqual({ needsAttention: [], raising: [], inMotion: [], closed: [] });
  });
});

describe("derivePortfolioStats", () => {
  it("returns all zeros for an empty portfolio", () => {
    const s = derivePortfolioStats([], NOOP_FEE);
    expect(s).toEqual({
      liveExposure: 0,
      landingKg: 0,
      savedVsBase: 0,
      ytdSpend: 0,
      liveCount: 0,
      inMotionCount: 0,
    });
  });

  it("sums Live Exposure across raising commitments and excludes charge_failed", () => {
    const raising = mkGroup({
      groupKey: "gr", lotId: "lot-r",
      lot: mkLot({ id: "lot-r", settlement_status: "pending", commitment_deadline: dayOffset(2) }),
      commitments: [
        mkCommit({ quantity_kg: 80, price_per_kg: 14.2, payment_status: "setup_complete" }),
        mkCommit({ quantity_kg: 100, price_per_kg: 14.2, payment_status: "charge_failed" }),
      ],
    });
    const s = derivePortfolioStats([raising], NOOP_FEE);
    // 80 × 14.20 = 1136. The charge_failed 100 lb must NOT contribute.
    expect(s.liveExposure).toBeCloseTo(1136, 2);
    expect(s.liveCount).toBe(1);
  });

  it("nets refund out of YTD Spend (fully refunded minimum_not_met → $0)", () => {
    const refunded = mkGroup({
      groupKey: "gm", lotId: "lot-m",
      lot: mkLot({ id: "lot-m", settlement_status: "minimum_not_met" }),
      // total_price 7820, charge_amount_cents 0 → fully refunded → net 0
      commitments: [mkCommit({ total_price: 7820, charge_amount_cents: 0, payment_status: "charge_succeeded" })],
    });
    const succeeded = mkGroup({
      groupKey: "gp", lotId: "lot-p",
      lot: mkLot({ id: "lot-p", settlement_status: "settled" }),
      commitments: [
        mkCommit({
          total_price: 3312,
          charge_amount_cents: 331200,
          payment_status: "charge_succeeded",
          picked_up_at: dayOffset(-90),
        }),
      ],
    });
    const s = derivePortfolioStats([refunded, succeeded], NOOP_FEE);
    expect(s.ytdSpend).toBeCloseTo(3312, 2);
  });

  it("excludes charge_failed from YTD Spend entirely", () => {
    const failed = mkGroup({
      commitments: [mkCommit({ payment_status: "charge_failed", charge_amount_cents: null, total_price: 1000 })],
    });
    const s = derivePortfolioStats([failed], NOOP_FEE);
    expect(s.ytdSpend).toBe(0);
  });

  it("counts secured_kg in Landing Soon for funds_held/in_transit/at_hub only", () => {
    const inTransit = mkGroup({
      groupKey: "gt", lotId: "lot-t",
      lot: mkLot({ id: "lot-t", settlement_status: "settled" }),
      shipment: { status: "in_transit", carrier: null, tracking_number: null, shipped_at: null, delivered_at: null, hub: null },
      commitments: [mkCommit({ quantity_kg: 600, payment_status: "charge_succeeded" })],
    });
    const raising = mkGroup({
      groupKey: "gr", lotId: "lot-r",
      lot: mkLot({ id: "lot-r", settlement_status: "pending", commitment_deadline: dayOffset(2) }),
      commitments: [mkCommit({ quantity_kg: 999 })],
    });
    const s = derivePortfolioStats([inTransit, raising], NOOP_FEE);
    expect(s.landingKg).toBe(600);
    expect(s.inMotionCount).toBe(1);
  });

  it("computes Saved via Tiers as (lot base price × qty) minus actual paid", () => {
    // Lot base price = $17.50/lb. Buyer's commitment was charged $1,420
    // (qty 100 lb), reflecting a tier-unlock discount net of refunds.
    // Savings = 17.50 × 100 − 1,420 = $330.
    const saved = mkGroup({
      groupKey: "gs", lotId: "lot-s",
      lot: mkLot({ id: "lot-s", settlement_status: "settled", price_per_kg: 17.5 }),
      commitments: [
        mkCommit({
          quantity_kg: 100,
          price_per_kg: 14.2,
          total_price: 1750,
          charge_amount_cents: 142000, // $1,420 net (after tier-unlock refund)
          payment_status: "charge_succeeded",
          picked_up_at: dayOffset(-90),
        }),
      ],
    });
    const s = derivePortfolioStats([saved], NOOP_FEE);
    expect(s.savedVsBase).toBeCloseTo(330, 2);
  });

  it("returns 0 saved when buyer paid the lot's base price (no tier unlock)", () => {
    const noSavings = mkGroup({
      lot: mkLot({ settlement_status: "settled", price_per_kg: 17.5 }),
      commitments: [
        mkCommit({
          quantity_kg: 100,
          price_per_kg: 17.5,
          total_price: 1750,
          charge_amount_cents: 175000, // paid full base
          payment_status: "charge_succeeded",
        }),
      ],
    });
    const s = derivePortfolioStats([noSavings], NOOP_FEE);
    expect(s.savedVsBase).toBe(0);
  });

  it("excludes charge_failed and cancelled commitments from Saved via Tiers", () => {
    const mixed = mkGroup({
      lot: mkLot({ settlement_status: "settled", price_per_kg: 17.5 }),
      commitments: [
        mkCommit({ quantity_kg: 50, payment_status: "charge_failed", charge_amount_cents: null, total_price: 875 }),
        mkCommit({ quantity_kg: 50, status: "cancelled", payment_status: "cancelled", charge_amount_cents: null, total_price: 875 }),
      ],
    });
    const s = derivePortfolioStats([mixed], NOOP_FEE);
    expect(s.savedVsBase).toBe(0);
  });

  it("applies the platform fee to the base-price side of the comparison", () => {
    // With a 10% platform fee: base = $17.50 → effective base = $19.25.
    // Buyer paid $1,420 net for 100 lb → savings = 19.25 × 100 − 1420 = $505.
    const tenPctFee = (p: number) => p * 1.1;
    const g = mkGroup({
      lot: mkLot({ settlement_status: "settled", price_per_kg: 17.5 }),
      commitments: [
        mkCommit({
          quantity_kg: 100,
          payment_status: "charge_succeeded",
          charge_amount_cents: 142000,
          total_price: 1925,
        }),
      ],
    });
    const s = derivePortfolioStats([g], tenPctFee);
    expect(s.savedVsBase).toBeCloseTo(505, 2);
  });
});

// ---------------------------------------------------------------------------
// Bag-aware lifecycle helpers (migration #38 onward)
// ---------------------------------------------------------------------------
// Bag-aware commitments leave commitment.payment_status parked at
// 'setup_complete'; the real charge state lives in commitment_bag_charges.
// Without these helpers, hasChargeFailed + derivePortfolioStats would silently
// return wrong-for-bag-aware values (every bag-aware lot → $0 portfolio stats,
// no surfacing of failed bags in needsAttention).

let bcId = 0;
const mkBag = (over: Partial<BagChargeRow> = {}): BagChargeRow => {
  bcId += 1;
  return {
    id: `bc-${bcId}`,
    commitment_id: "c-bag-1",
    bag_number: bcId,
    kg: 29,
    amount_cents: 73351, // $733.51 — mirrors a real bag charge from Sour Grape
    payment_status: "charged",
    updated_at: new Date().toISOString(),
    ...over,
  };
};

describe("effectiveChargeState — bag-aware derivation", () => {
  it("treats a commit with no bag rows as legacy (uses commitment.payment_status)", () => {
    expect(
      effectiveChargeState({ payment_status: "charge_succeeded" }, undefined)
    ).toBe("succeeded");
    expect(
      effectiveChargeState({ payment_status: "charge_failed" }, [])
    ).toBe("failed");
    expect(
      effectiveChargeState({ payment_status: "setup_complete" }, undefined)
    ).toBe("pre_settlement");
  });

  it("returns succeeded when every bag is charged", () => {
    expect(
      effectiveChargeState({ payment_status: "setup_complete" }, [
        mkBag({ payment_status: "charged" }),
        mkBag({ payment_status: "charged" }),
      ])
    ).toBe("succeeded");
  });

  it("returns failed the moment any single bag is payment_failed (even with charged siblings)", () => {
    expect(
      effectiveChargeState({ payment_status: "setup_complete" }, [
        mkBag({ payment_status: "charged" }),
        mkBag({ payment_status: "payment_failed" }),
      ])
    ).toBe("failed");
  });

  it("returns in_flight when bags exist but none failed and not all charged yet", () => {
    expect(
      effectiveChargeState({ payment_status: "setup_complete" }, [
        mkBag({ payment_status: "charged" }),
        mkBag({ payment_status: "awaiting_charge" }),
      ])
    ).toBe("in_flight");
    expect(
      effectiveChargeState({ payment_status: "setup_complete" }, [
        mkBag({ payment_status: "retry_scheduled" }),
      ])
    ).toBe("in_flight");
  });
});

describe("effectiveChargedCents / effectiveChargedKg", () => {
  it("sums only the charged bag rows for bag-aware commits", () => {
    const commit = { payment_status: "setup_complete" as const, charge_amount_cents: null, quantity_kg: 58 };
    const bags = [
      mkBag({ kg: 29, amount_cents: 73351, payment_status: "charged" }),
      mkBag({ kg: 29, amount_cents: 73352, payment_status: "payment_failed" }),
    ];
    expect(effectiveChargedCents(commit, bags)).toBe(73351);
    expect(effectiveChargedKg(commit, bags)).toBe(29);
  });

  it("falls back to commitment-level fields for legacy commits", () => {
    expect(
      effectiveChargedCents(
        { payment_status: "charge_succeeded", charge_amount_cents: 142000 },
        undefined
      )
    ).toBe(142000);
    expect(
      effectiveChargedKg(
        { payment_status: "charge_succeeded", quantity_kg: 100 },
        undefined
      )
    ).toBe(100);
  });

  it("returns 0 for legacy commits that aren't terminal-success", () => {
    expect(
      effectiveChargedCents(
        { payment_status: "charge_failed", charge_amount_cents: 999 },
        undefined
      )
    ).toBe(0);
    expect(
      effectiveChargedKg(
        { payment_status: "setup_complete", quantity_kg: 50 },
        undefined
      )
    ).toBe(0);
  });
});

describe("bucketByLifecycle — bag-aware needsAttention", () => {
  it("surfaces a bag-aware commit with any failed bag in needsAttention (even though commitment.payment_status is still setup_complete)", () => {
    const bagAwareFailed = mkGroup({
      groupKey: "g-bf", lotId: "lot-bf", campaignId: "g-bf",
      lot: mkLot({ id: "lot-bf", settlement_status: "settled" }),
      commitments: [
        mkCommit({
          id: "c-bag-failed",
          payment_status: "setup_complete",
          charge_amount_cents: null,
          charged_at: null,
        }),
      ],
      bagChargesByCommitmentId: {
        "c-bag-failed": [
          mkBag({ commitment_id: "c-bag-failed", payment_status: "charged" }),
          mkBag({ commitment_id: "c-bag-failed", payment_status: "payment_failed" }),
        ],
      },
    });
    const out = bucketByLifecycle([bagAwareFailed]);
    expect(out.needsAttention.map((g) => g.lotId)).toEqual(["lot-bf"]);
  });

  it("does NOT surface a bag-aware commit whose bags are still in-flight (no failures yet)", () => {
    const inFlight = mkGroup({
      groupKey: "g-if", lotId: "lot-if", campaignId: "g-if",
      lot: mkLot({ id: "lot-if", settlement_status: "settled" }),
      commitments: [mkCommit({ id: "c-if", payment_status: "setup_complete", charge_amount_cents: null })],
      bagChargesByCommitmentId: {
        "c-if": [
          mkBag({ commitment_id: "c-if", payment_status: "charged" }),
          mkBag({ commitment_id: "c-if", payment_status: "awaiting_charge" }),
        ],
      },
    });
    const out = bucketByLifecycle([inFlight]);
    expect(out.needsAttention).toEqual([]);
  });
});

describe("derivePortfolioStats — bag-aware paths", () => {
  it("counts charged-bag kg toward landingKg for a bag-aware in-motion group (regression: legacy filter returned 0)", () => {
    const inFlight = mkGroup({
      groupKey: "gbi", lotId: "lot-bi", campaignId: "gbi",
      lot: mkLot({ id: "lot-bi", settlement_status: "settled" }),
      shipment: { status: "in_transit", carrier: null, tracking_number: null, shipped_at: null, delivered_at: null, hub: null },
      commitments: [
        mkCommit({ id: "c-bi", payment_status: "setup_complete", charge_amount_cents: null, quantity_kg: 58 }),
      ],
      bagChargesByCommitmentId: {
        "c-bi": [
          mkBag({ commitment_id: "c-bi", kg: 29, payment_status: "charged" }),
          mkBag({ commitment_id: "c-bi", kg: 29, payment_status: "charged" }),
        ],
      },
    });
    const s = derivePortfolioStats([inFlight], NOOP_FEE);
    expect(s.landingKg).toBe(58);
  });

  it("only credits the charged bags' kg when some bags have failed", () => {
    // Spec C5: Landing Soon reflects what the buyer has actually secured —
    // the failed bag is gone, so it shouldn't sit in Landing Soon.
    const partial = mkGroup({
      groupKey: "gbp", lotId: "lot-bp", campaignId: "gbp",
      lot: mkLot({ id: "lot-bp", settlement_status: "settled" }),
      shipment: { status: "in_transit", carrier: null, tracking_number: null, shipped_at: null, delivered_at: null, hub: null },
      commitments: [
        mkCommit({ id: "c-bp", payment_status: "setup_complete", charge_amount_cents: null, quantity_kg: 58 }),
      ],
      bagChargesByCommitmentId: {
        "c-bp": [
          mkBag({ commitment_id: "c-bp", kg: 29, payment_status: "charged" }),
          mkBag({ commitment_id: "c-bp", kg: 29, payment_status: "payment_failed" }),
        ],
      },
    });
    const s = derivePortfolioStats([partial], NOOP_FEE);
    expect(s.landingKg).toBe(29);
  });

  it("sums charged-bag amount_cents into ytdSpend using bag updated_at as the year bucket (regression: legacy filter returned 0)", () => {
    const now = new Date();
    const thisYearBagTs = new Date(now.getFullYear(), 1, 1).toISOString();
    const lastYearBagTs = new Date(now.getFullYear() - 1, 11, 1).toISOString();

    const g = mkGroup({
      groupKey: "gy", lotId: "lot-y", campaignId: "gy",
      lot: mkLot({ id: "lot-y", settlement_status: "settled" }),
      commitments: [
        mkCommit({ id: "c-y", payment_status: "setup_complete", charge_amount_cents: null, charged_at: null }),
      ],
      bagChargesByCommitmentId: {
        "c-y": [
          mkBag({ commitment_id: "c-y", amount_cents: 50000, payment_status: "charged", updated_at: thisYearBagTs }),
          mkBag({ commitment_id: "c-y", amount_cents: 99999, payment_status: "charged", updated_at: lastYearBagTs }),
        ],
      },
    });
    const s = derivePortfolioStats([g], NOOP_FEE);
    // Both bags are summed, but the MAX(updated_at) decides the year — that
    // max lands in the current year, so the whole net spend counts. (The
    // bag-level partial-year split isn't part of the spec; per-commitment
    // year attribution is sufficient because settlement runs in a tight
    // window, not split across years.)
    expect(s.ytdSpend).toBeCloseTo((50000 + 99999) / 100, 2);
  });

  it("excludes failed-bag amount_cents from ytdSpend (partial-failure commits only credit charged bags)", () => {
    const now = new Date();
    const ts = new Date(now.getFullYear(), 1, 1).toISOString();
    const g = mkGroup({
      lot: mkLot({ settlement_status: "settled" }),
      commitments: [
        mkCommit({ id: "c-pf", payment_status: "setup_complete", charge_amount_cents: null, charged_at: null }),
      ],
      bagChargesByCommitmentId: {
        "c-pf": [
          mkBag({ commitment_id: "c-pf", amount_cents: 100000, payment_status: "charged", updated_at: ts }),
          mkBag({ commitment_id: "c-pf", amount_cents: 100000, payment_status: "payment_failed", updated_at: ts }),
        ],
      },
    });
    const s = derivePortfolioStats([g], NOOP_FEE);
    expect(s.ytdSpend).toBeCloseTo(1000, 2);
  });

  it("computes savedVsBase using kg actually charged so a partial-failure commit doesn't claim savings on dropped bags", () => {
    // Base price $10/kg. Buyer paid $733.51 net for the 29kg bag that actually
    // charged (the other 29kg bag failed). Would-have-paid at base = 10 × 29 = $290.
    // Actual paid = $733.51. So savedVsBase = max(0, 290 - 733.51) = 0.
    // (i.e. the buyer paid ABOVE base on the charged kg — that's a "loss" we
    // clamp at zero, not negative savings.)
    const g = mkGroup({
      lot: mkLot({ settlement_status: "settled", price_per_kg: 10 }),
      commitments: [
        mkCommit({
          id: "c-sv",
          payment_status: "setup_complete",
          charge_amount_cents: null,
          quantity_kg: 58,
        }),
      ],
      bagChargesByCommitmentId: {
        "c-sv": [
          mkBag({ commitment_id: "c-sv", kg: 29, amount_cents: 73351, payment_status: "charged" }),
          mkBag({ commitment_id: "c-sv", kg: 29, amount_cents: 73352, payment_status: "payment_failed" }),
        ],
      },
    });
    const s = derivePortfolioStats([g], NOOP_FEE);
    expect(s.savedVsBase).toBe(0);
  });

  it("computes savedVsBase from actual-paid bag amount when a tier unlock reduced the buyer's bag price below the lot's base", () => {
    // Base $15/kg → would-have-paid for 58kg = $870. Buyer actually paid two
    // bags at $400 each → $800. Savings = $70.
    const g = mkGroup({
      lot: mkLot({ settlement_status: "settled", price_per_kg: 15 }),
      commitments: [
        mkCommit({
          id: "c-sv2",
          payment_status: "setup_complete",
          charge_amount_cents: null,
          quantity_kg: 58,
        }),
      ],
      bagChargesByCommitmentId: {
        "c-sv2": [
          mkBag({ commitment_id: "c-sv2", kg: 29, amount_cents: 40000, payment_status: "charged" }),
          mkBag({ commitment_id: "c-sv2", kg: 29, amount_cents: 40000, payment_status: "charged" }),
        ],
      },
    });
    const s = derivePortfolioStats([g], NOOP_FEE);
    expect(s.savedVsBase).toBeCloseTo(70, 2);
  });
});

describe("deriveNeedsAttentionDisplay", () => {
  it("returns hasAny=false for a group with no failed commits", () => {
    const g = mkGroup({ commitments: [mkCommit({ payment_status: "charge_succeeded" })] });
    const d = deriveNeedsAttentionDisplay(g);
    expect(d.hasAny).toBe(false);
    expect(d.failedKg).toBe(0);
  });

  it("legacy: sums quantity_kg and surfaces payment_error", () => {
    const g = mkGroup({
      commitments: [
        mkCommit({
          payment_status: "charge_failed",
          quantity_kg: 50,
          payment_error: "Your card was declined.",
        }),
      ],
    });
    const d = deriveNeedsAttentionDisplay(g);
    expect(d.hasAny).toBe(true);
    expect(d.failedKg).toBe(50);
    expect(d.reason).toBe("Your card was declined.");
  });

  it("legacy: falls back to generic message when payment_error is null", () => {
    const g = mkGroup({
      commitments: [mkCommit({ payment_status: "charge_failed", quantity_kg: 25, payment_error: null })],
    });
    const d = deriveNeedsAttentionDisplay(g);
    expect(d.reason).toBe("Your card was declined");
  });

  it("bag-aware: counts only the failed bags' kg toward failedKg (regression: legacy code returned 0)", () => {
    const g = mkGroup({
      commitments: [
        mkCommit({
          id: "c-bx",
          payment_status: "setup_complete",
          quantity_kg: 58,
          charge_amount_cents: null,
        }),
      ],
      bagChargesByCommitmentId: {
        "c-bx": [
          mkBag({ commitment_id: "c-bx", kg: 29, payment_status: "charged" }),
          mkBag({ commitment_id: "c-bx", kg: 29, payment_status: "payment_failed" }),
        ],
      },
    });
    const d = deriveNeedsAttentionDisplay(g);
    expect(d.hasAny).toBe(true);
    expect(d.failedKg).toBe(29);
    expect(d.reason).toBe("Your card couldn't be charged for 1 of 2 bags");
  });

  it("bag-aware: 'any of the bags' phrasing when every bag failed", () => {
    const g = mkGroup({
      commitments: [
        mkCommit({ id: "c-by", payment_status: "setup_complete", quantity_kg: 58 }),
      ],
      bagChargesByCommitmentId: {
        "c-by": [
          mkBag({ commitment_id: "c-by", kg: 29, payment_status: "payment_failed" }),
          mkBag({ commitment_id: "c-by", kg: 29, payment_status: "payment_failed" }),
        ],
      },
    });
    const d = deriveNeedsAttentionDisplay(g);
    expect(d.failedKg).toBe(58);
    expect(d.reason).toBe("Your card couldn't be charged for any of the bags");
  });

  it("bag-aware in-flight commits (no failures yet) are NOT surfaced", () => {
    const g = mkGroup({
      commitments: [mkCommit({ id: "c-bz", payment_status: "setup_complete" })],
      bagChargesByCommitmentId: {
        "c-bz": [
          mkBag({ commitment_id: "c-bz", payment_status: "charged" }),
          mkBag({ commitment_id: "c-bz", payment_status: "awaiting_charge" }),
        ],
      },
    });
    const d = deriveNeedsAttentionDisplay(g);
    expect(d.hasAny).toBe(false);
    expect(d.failedKg).toBe(0);
  });
});

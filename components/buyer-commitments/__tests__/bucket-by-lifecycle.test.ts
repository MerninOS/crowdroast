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
  type CommitmentGroup,
} from "../bucket-by-lifecycle";
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

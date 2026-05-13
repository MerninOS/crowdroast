/**
 * Task 4.7 — Bag-aware campaign close: below-min-bags failure.
 *
 * Spec AC7: when a bag-aware campaign reaches its deadline with
 * completed_bags < min_bags_to_succeed, the campaign is marked 'failed'
 * and ZERO commitment_bag_charges rows are created. Under the
 * charge-on-fill model nothing was charged at commit (setup_intent only),
 * so there is nothing to refund and no Stripe call should be made on this
 * path.
 *
 * Seed for the happy-failure path: lot with bag_size_kg=60,
 * min_bags_to_succeed=3, committed_quantity_kg=120 → completed_bags=2,
 * which is below the threshold of 3.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

type Update = { table: string; payload: Record<string, unknown>; eqId?: unknown };
type Upsert = { table: string; rows: unknown[]; options?: unknown };

const updateCalls: Update[] = [];
const upsertCalls: Upsert[] = [];
const fromQueue: Array<() => Record<string, unknown>> = [];
let pendingTable: string | null = null;

function makeChain(response: { data: unknown; error: unknown; count?: number | null }) {
  let pendingPayload: Record<string, unknown> | null = null;
  let pendingEqId: unknown = undefined;
  const table = pendingTable!;
  const chain: Record<string, unknown> = {
    update: vi.fn((p: Record<string, unknown>) => {
      pendingPayload = p;
      return chain;
    }),
    upsert: vi.fn((rows: unknown[], options?: unknown) => {
      upsertCalls.push({ table, rows, options });
      return Promise.resolve({
        data: response.data,
        error: response.error,
        count: response.count ?? null,
      });
    }),
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn((col: string, val: unknown) => {
      if (col === "id") pendingEqId = val;
      return chain;
    }),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(() => {
      if (pendingPayload) updateCalls.push({ table, payload: pendingPayload, eqId: pendingEqId });
      return Promise.resolve(response);
    }),
    single: vi.fn(() => {
      if (pendingPayload) updateCalls.push({ table, payload: pendingPayload, eqId: pendingEqId });
      return Promise.resolve(response);
    }),
    then: (resolve: (v: unknown) => void) => {
      if (pendingPayload) updateCalls.push({ table, payload: pendingPayload, eqId: pendingEqId });
      return Promise.resolve(response).then(resolve);
    },
  };
  return chain;
}

function enqueue(
  table: string,
  response: { data: unknown; error: unknown; count?: number | null }
) {
  fromQueue.push(() => {
    pendingTable = table;
    return makeChain(response);
  });
}

type RpcCall = { fn: string; args: unknown };
const rpcCalls: RpcCall[] = [];

const PASSIVE_TABLES = new Set(["referral_attributions", "credit_ledger"]);

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      const next = fromQueue.shift();
      if (!next) {
        if (PASSIVE_TABLES.has(table)) {
          pendingTable = table;
          return makeChain({ data: [], error: null });
        }
        throw new Error(`Unexpected from(${table}) — queue empty`);
      }
      return next();
    }),
    rpc: vi.fn((fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve({ data: null, error: null });
    }),
  })),
}));

vi.mock("@/lib/auth/admin", () => ({
  getConfiguredAdminEmails: () => ["admin@test.local"],
}));

vi.mock("@/lib/email", () => ({
  sendLotClosedEmailsBatch: vi.fn().mockResolvedValue({ success: true }),
  sendLotFailedEmail: vi.fn().mockResolvedValue({ success: true }),
  sendReferralCreditEarnedEmail: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/shipments", () => ({
  createShipmentForLot: vi.fn().mockResolvedValue({ ok: true }),
}));

// Track every Stripe call: AC7's "no charge happens" invariant means none
// of these may be invoked on the below-min-bags failure path.
const stripeMocks = vi.hoisted(() => ({
  createTransfer: vi.fn().mockResolvedValue({ id: "tr_x" }),
  createRefund: vi.fn().mockResolvedValue({ id: "re_x" }),
  getConnectedAccount: vi.fn().mockResolvedValue({
    capabilities: { transfers: "active" },
  }),
  getPaymentIntent: vi.fn().mockResolvedValue({ latest_charge: null }),
  getChargeFeeCents: vi.fn().mockResolvedValue(0),
  listRefundsForPaymentIntent: vi.fn().mockResolvedValue({ data: [] }),
  listTransfersForSourceCharge: vi.fn().mockResolvedValue({ data: [] }),
}));

vi.mock("@/lib/stripe", () => ({
  getConnectedAccount: stripeMocks.getConnectedAccount,
  getPaymentIntent: stripeMocks.getPaymentIntent,
  getChargeFeeCents: stripeMocks.getChargeFeeCents,
  listRefundsForPaymentIntent: stripeMocks.listRefundsForPaymentIntent,
  listTransfersForSourceCharge: stripeMocks.listTransfersForSourceCharge,
  createTransfer: stripeMocks.createTransfer,
  createRefund: stripeMocks.createRefund,
}));

vi.mock("@/lib/referrals/insert-attribution", () => ({
  insertReferralAttributionIfEligible: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/referrals/settle-attribution", () => ({
  settleAttributionIfPending: vi.fn().mockResolvedValue({ earned: false, inviterUserId: null }),
}));
vi.mock("@/lib/referrals/void-attribution", () => ({
  voidAttributionsForCampaign: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/referrals/apply-credit", () => ({
  applyInviterCreditOnSettle: vi
    .fn(async (_admin, args: { platformAmountCents: number }) => ({
      applied: 0,
      adjustedPlatformAmountCents: args.platformAmountCents,
      ledgerRowInserted: false,
    })),
}));

import { POST } from "@/app/api/payments/settle-deadlines/route";

const CRON_SECRET = "test-secret";

beforeEach(() => {
  vi.clearAllMocks();
  updateCalls.length = 0;
  upsertCalls.length = 0;
  fromQueue.length = 0;
  rpcCalls.length = 0;
  pendingTable = null;
  process.env.CRON_SECRET = CRON_SECRET;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
});

function makeReq(): Request {
  return new Request("http://localhost/api/payments/settle-deadlines", {
    method: "POST",
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
}

describe("settle-deadlines — bag-aware below-min-bags failure (Task 4.7)", () => {
  it("marks campaign 'failed', creates zero commitment_bag_charges rows, makes no Stripe calls", async () => {
    // Pre-cron setup queries
    enqueue("platform_settings", {
      data: { platform_connect_account_id: "acct_platform" },
      error: null,
    });
    enqueue("profiles", { data: [], error: null }); // payout profiles list
    enqueue("campaigns", {
      data: [
        {
          id: "camp-failed",
          lot_id: "lot-failed",
          hub_id: "hub-1",
          deadline: new Date(Date.now() - 60_000).toISOString(),
          status: "active",
        },
      ],
      error: null,
    });

    // 1) orphan query — none
    enqueue("commitments", { data: [], error: null });

    // 2) lot fetch — bag-aware lot, minimum kg met but only 2 completed bags
    //    (need 3 to succeed). committed_quantity_kg=120, bag_size_kg=60 →
    //    floor(120/60)=2; min_bags_to_succeed=3 → fail.
    //    min_commitment_kg is 60 so the legacy kg-minimum check passes and
    //    we fall through to the bag-aware branch where AC7 fires.
    enqueue("lots", {
      data: {
        id: "lot-failed",
        title: "Below Min Bags Lot",
        seller_id: "seller-1",
        status: "active",
        currency: "usd",
        price_per_kg: 10,
        committed_quantity_kg: 120,
        min_commitment_kg: 60,
        commitment_deadline: new Date(Date.now() - 60_000).toISOString(),
        bag_size_kg: 60,
        min_bags_to_succeed: 3,
      },
      error: null,
    });

    // 3) seller profile (needed before the bag-aware branch is entered)
    enqueue("profiles", {
      data: { stripe_connect_account_id: "acct_seller" },
      error: null,
    });

    // 4) pricing tiers (none — base price applies)
    enqueue("pricing_tiers", { data: [], error: null });

    // 5) bag-aware commitments query (used for expandToBagPortions if we got
    //    that far; we don't, but the route always reads it before the
    //    below-min-bags check).
    enqueue("commitments", {
      data: [
        { id: "commit-1", quantity_kg: 60, created_at: "2026-01-01T00:00:00.000Z" },
        { id: "commit-2", quantity_kg: 60, created_at: "2026-01-02T00:00:00.000Z" },
      ],
      error: null,
    });

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();

    // 1. Result row reports outcome:'failed' with the below_min_bags reason
    expect(body.processed_campaigns).toBe(1);
    expect(body.results[0]).toMatchObject({
      campaign_id: "camp-failed",
      lot_id: "lot-failed",
      outcome: "failed",
      reason: "below_min_bags",
      completed_bags: 2,
      min_bags_to_succeed: 3,
      bag_size_kg: 60,
      bag_charges_planned: 0,
      bag_charges_inserted: 0,
    });

    // 2. Campaign transitioned to 'failed' via finalize_campaign RPC
    //    (same atomic primitive the legacy below-min path uses).
    const finalizeCall = rpcCalls.find((c) => c.fn === "finalize_campaign");
    expect(finalizeCall?.args).toEqual({
      p_campaign_id: "camp-failed",
      p_outcome: "failed",
    });

    // 3. ZERO commitment_bag_charges rows inserted — this is the core AC7
    //    invariant under the charge-on-fill model.
    const bagChargesUpserts = upsertCalls.filter(
      (c) => c.table === "commitment_bag_charges"
    );
    expect(bagChargesUpserts).toHaveLength(0);

    // 4. No kg_locked_at_settlement stamp on any commitment — the bag-fill
    //    work is meaningless when the campaign failed.
    const kgLockedUpdates = updateCalls.filter(
      (c) =>
        c.table === "commitments" &&
        Object.prototype.hasOwnProperty.call(c.payload, "kg_locked_at_settlement")
    );
    expect(kgLockedUpdates).toHaveLength(0);

    // 5. No Stripe calls were made. Under charge-on-fill there's nothing
    //    to refund (no commit-time charge was ever taken) and nothing to
    //    transfer (no bag completed). Note: getConnectedAccount is called
    //    once during the cron's platform-account capability probe — that's
    //    unrelated to the below-min-bags path, so we exclude it from this
    //    check.
    expect(stripeMocks.createTransfer).not.toHaveBeenCalled();
    expect(stripeMocks.createRefund).not.toHaveBeenCalled();
    expect(stripeMocks.getPaymentIntent).not.toHaveBeenCalled();
    expect(stripeMocks.getChargeFeeCents).not.toHaveBeenCalled();
    expect(stripeMocks.listRefundsForPaymentIntent).not.toHaveBeenCalled();
    expect(stripeMocks.listTransfersForSourceCharge).not.toHaveBeenCalled();
  });
});

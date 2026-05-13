/**
 * M9 regression — bag-aware lots must skip the legacy
 * `committed_quantity_kg >= min_commitment_kg` gate.
 *
 * Before the fix the per-campaign loop in `app/api/payments/settle-deadlines/
 * route.ts` evaluated `minimumMet = committed_quantity_kg >= min_commitment_kg`
 * for every lot. A bag-aware lot whose buyers filled enough bags to clear AC7
 * (`completed_bags >= min_bags_to_succeed`) but whose raw kg total fell below
 * the legacy kg-threshold would be routed into the legacy refund/cancel
 * failure branch — with the WRONG failure email and BEFORE the bag-aware
 * branch ever ran.
 *
 * Fixture (the scenario the review finding called out verbatim):
 *   bag_size_kg = 60
 *   min_commitment_kg = 200       ← legacy threshold
 *   min_bags_to_succeed = 3       ← AC7 source-of-truth
 *   committed_quantity_kg = 180   ← 3 × 60 → 3 completed bags
 *
 *   180 < 200  → legacy `minimumMet` is false
 *   3 ≥ 3      → AC7 passes; this is a SUCCESSFUL bag-aware close.
 *
 * Asserts the route takes the bag-aware-success branch:
 *   • result.outcome === 'bag_charges_created'
 *   • 3 commitment_bag_charges rows upserted
 *   • finalize_campaign NOT called as 'failed'
 *   • createRefund NOT called (legacy refund path never entered)
 *
 * Mocking style mirrors `bag-aware-below-min-bags.test.ts` and the
 * `bag-aware-lifecycle.integration.test.ts` route-side stub.
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
        count: response.count ?? rows.length,
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
      if (pendingPayload)
        updateCalls.push({ table, payload: pendingPayload, eqId: pendingEqId });
      return Promise.resolve(response);
    }),
    single: vi.fn(() => {
      if (pendingPayload)
        updateCalls.push({ table, payload: pendingPayload, eqId: pendingEqId });
      return Promise.resolve(response);
    }),
    then: (resolve: (v: unknown) => void) => {
      if (pendingPayload)
        updateCalls.push({ table, payload: pendingPayload, eqId: pendingEqId });
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
  sendPaymentUpdateRequiredEmail: vi.fn().mockResolvedValue({ success: true }),
  sendCampaignSettledEmail: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/shipments", () => ({
  createShipmentForLot: vi.fn().mockResolvedValue({ ok: true }),
}));

const stripeMocks = vi.hoisted(() => ({
  createTransfer: vi.fn().mockResolvedValue({ id: "tr_x" }),
  createRefund: vi.fn().mockResolvedValue({ id: "re_x" }),
  createBagTransfer: vi.fn().mockResolvedValue({ id: "tr_bag_x" }),
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
  createBagTransfer: stripeMocks.createBagTransfer,
}));

vi.mock("@/lib/referrals/insert-attribution", () => ({
  insertReferralAttributionIfEligible: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/referrals/settle-attribution", () => ({
  settleAttributionIfPending: vi
    .fn()
    .mockResolvedValue({ earned: false, inviterUserId: null }),
}));
vi.mock("@/lib/referrals/void-attribution", () => ({
  voidAttributionsForCampaign: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/referrals/apply-credit", () => ({
  applyInviterCreditOnSettle: vi.fn(
    async (_admin: unknown, args: { platformAmountCents: number }) => ({
      applied: 0,
      adjustedPlatformAmountCents: args.platformAmountCents,
      ledgerRowInserted: false,
    })
  ),
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

describe("settle-deadlines — M9: bag-aware lots skip the legacy kg-minimum gate", () => {
  it("routes a bag-aware lot with committed_kg < min_commitment_kg but completed_bags >= min_bags_to_succeed into the bag-aware-success branch", async () => {
    // Pre-cron setup queries.
    enqueue("platform_settings", {
      data: { platform_connect_account_id: "acct_platform" },
      error: null,
    });
    enqueue("profiles", { data: [], error: null });
    enqueue("campaigns", {
      data: [
        {
          id: "camp-m9",
          lot_id: "lot-m9",
          hub_id: "hub-1",
          deadline: new Date(Date.now() - 60_000).toISOString(),
          status: "active",
        },
      ],
      error: null,
    });

    // Per-campaign sequence: orphan query → lot → seller → tiers →
    // bag-aware commitments → commitment_bag_charges upsert → 3×
    // kg_locked_at_settlement stamps.
    enqueue("commitments", { data: [], error: null });

    // The M9 fixture: 180kg < 200kg legacy threshold, but 3 ≥ 3 bags.
    enqueue("lots", {
      data: {
        id: "lot-m9",
        title: "M9 Regression Lot",
        seller_id: "seller-1",
        status: "active",
        currency: "usd",
        price_per_kg: 10,
        committed_quantity_kg: 180, // below min_commitment_kg
        min_commitment_kg: 200, // legacy gate would FAIL here
        commitment_deadline: new Date(Date.now() - 60_000).toISOString(),
        bag_size_kg: 60, // bag-aware
        min_bags_to_succeed: 3, // 180 / 60 = 3 → AC7 passes
      },
      error: null,
    });

    enqueue("profiles", {
      data: { stripe_connect_account_id: "acct_seller" },
      error: null,
    });
    enqueue("pricing_tiers", { data: [], error: null });

    // Three buyers, each 60kg = one full bag. Chronological order matters
    // for bag-portion expansion (created_at ASC, id ASC).
    enqueue("commitments", {
      data: [
        {
          id: "commit-A",
          quantity_kg: 60,
          created_at: "2026-04-01T10:00:00.000Z",
        },
        {
          id: "commit-B",
          quantity_kg: 60,
          created_at: "2026-04-02T10:00:00.000Z",
        },
        {
          id: "commit-C",
          quantity_kg: 60,
          created_at: "2026-04-03T10:00:00.000Z",
        },
      ],
      error: null,
    });
    enqueue("commitment_bag_charges", {
      data: null,
      error: null,
      count: 3,
    });
    // Three kg_locked_at_settlement stamps — one per commit.
    enqueue("commitments", { data: null, error: null });
    enqueue("commitments", { data: null, error: null });
    enqueue("commitments", { data: null, error: null });

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();

    // 1. Route reports bag-aware SUCCESS — not 'failed', not
    //    'minimum_not_met'. This is the load-bearing assertion: pre-fix it
    //    would be 'minimum_not_met' (or 'failed' after refund processing).
    expect(body.processed_campaigns).toBe(1);
    expect(body.results[0]).toMatchObject({
      campaign_id: "camp-m9",
      lot_id: "lot-m9",
      outcome: "bag_charges_created",
      bag_size_kg: 60,
      completed_bags: 3,
      bag_charges_planned: 3,
      bag_charges_inserted: 3,
      commitments_stamped: 3,
    });

    // 2. Three commitment_bag_charges rows upserted (one per completed bag).
    const bagChargesUpserts = upsertCalls.filter(
      (u) => u.table === "commitment_bag_charges"
    );
    expect(bagChargesUpserts).toHaveLength(1);
    expect((bagChargesUpserts[0].rows as unknown[]).length).toBe(3);

    // 3. finalize_campaign was NOT called as 'failed' — the legacy
    //    minimum-not-met branch fires it with outcome='failed' before
    //    'continue'. If it shows up here, we hit the wrong branch.
    const finalizeFailed = rpcCalls.find(
      (c) =>
        c.fn === "finalize_campaign" &&
        (c.args as { p_outcome?: string })?.p_outcome === "failed"
    );
    expect(finalizeFailed).toBeUndefined();

    // 4. No refunds — the legacy below-minimum branch creates refunds for
    //    charge_succeeded commitments. Bag-aware never charged at commit.
    expect(stripeMocks.createRefund).not.toHaveBeenCalled();
  });
});

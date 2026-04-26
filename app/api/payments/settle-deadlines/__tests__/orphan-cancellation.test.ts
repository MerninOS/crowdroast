/**
 * Regression test for the "Min Not Met" bug.
 *
 * Symptom: a buyer commits, hits minimum, cron runs successfully, but the
 * lot still shows up as "Min Not Met" on the buyer commitments page and the
 * campaign DB row says `status='failed'`.
 *
 * Root cause: at deadline, any commitment with `stripe_payment_intent_id IS
 * NULL` (abandoned cart, last-minute commit, missed webhook) was added to
 * `failedCount`, flipping the campaign to `failed` even though every actual
 * charge succeeded.
 *
 * Fix: cancel orphans first (the lot trigger drops their qty), then evaluate.
 *
 * This test verifies the orphan path end-to-end without exercising the
 * Stripe transfer pipeline.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

type Update = { table: string; payload: Record<string, unknown>; eqId?: unknown };
const updateCalls: Update[] = [];
const fromQueue: Array<() => Record<string, unknown>> = [];
let pendingTable: string | null = null;

function makeChain(response: { data: unknown; error: unknown }) {
  let pendingPayload: Record<string, unknown> | null = null;
  let pendingEqId: unknown = undefined;
  const table = pendingTable!;
  const chain: Record<string, unknown> = {
    update: vi.fn((p: Record<string, unknown>) => {
      pendingPayload = p;
      return chain;
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

function enqueue(table: string, response: { data: unknown; error: unknown }) {
  fromQueue.push(() => {
    pendingTable = table;
    return makeChain(response);
  });
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      const next = fromQueue.shift();
      if (!next) throw new Error(`Unexpected from(${table}) — queue empty`);
      return next();
    }),
  })),
}));

vi.mock("@/lib/auth/admin", () => ({
  getConfiguredAdminEmails: () => ["admin@test.local"],
}));

vi.mock("@/lib/email", () => ({
  sendLotClosedEmailsBatch: vi.fn().mockResolvedValue({ success: true }),
  sendLotFailedEmail: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/shipments", () => ({
  createShipmentForLot: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/lib/stripe", () => ({
  getConnectedAccount: vi.fn().mockResolvedValue({
    capabilities: { transfers: "active" },
  }),
  getPaymentIntent: vi.fn().mockResolvedValue({ latest_charge: null }),
  listRefundsForPaymentIntent: vi.fn().mockResolvedValue({ data: [] }),
  listTransfersForSourceCharge: vi.fn().mockResolvedValue({ data: [] }),
  createTransfer: vi.fn().mockResolvedValue({ id: "tr_x" }),
  createRefund: vi.fn().mockResolvedValue({ id: "re_x" }),
}));

vi.mock("@/lib/payments/settlement-logic", () => ({
  getFinalPricePerKg: vi.fn(() => 10),
  computeChargeAdjustment: vi.fn(() => ({ finalAmountCents: 100000, refundAmountCents: 0 })),
  computeSellerNetAmountCents: vi.fn(() => 90000),
  computeSplit: vi.fn(() => ({ sellerAmount: 90000, hubAmount: 2000, platformAmount: 8000 })),
}));

import { POST } from "@/app/api/payments/settle-deadlines/route";

const CRON_SECRET = "test-secret";

beforeEach(() => {
  vi.clearAllMocks();
  updateCalls.length = 0;
  fromQueue.length = 0;
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

describe("settle-deadlines — orphan commitment handling", () => {
  it("cancels orphan commitments before evaluating minimum, settles when paid quantity meets minimum", async () => {
    // Pre-cron queries (platform setup)
    enqueue("platform_settings", {
      data: { platform_connect_account_id: "acct_platform" },
      error: null,
    });
    enqueue("profiles", { data: [], error: null }); // payout profiles list
    enqueue("campaigns", {
      data: [
        {
          id: "camp-1",
          lot_id: "lot-1",
          hub_id: "hub-1",
          deadline: new Date(Date.now() - 60_000).toISOString(),
          status: "active",
        },
      ],
      error: null,
    });

    // Per-campaign sequence:
    // 1) orphan query (one orphan with no payment intent)
    enqueue("commitments", { data: [{ id: "orphan-1" }], error: null });
    // 2) cancel orphan update
    enqueue("commitments", { data: null, error: null });
    // 3) lot fetch — committed_quantity_kg already reflects orphan removed by trigger
    enqueue("lots", {
      data: {
        id: "lot-1",
        seller_id: "seller-1",
        status: "active",
        currency: "usd",
        price_per_kg: 10,
        committed_quantity_kg: 100, // post-trigger: orphan dropped
        min_commitment_kg: 50,
        commitment_deadline: new Date(Date.now() - 60_000).toISOString(),
        settlement_status: "pending",
        expiry_date: new Date(Date.now() - 60_000).toISOString(),
      },
      error: null,
    });
    // 4) seller profile fetch
    enqueue("profiles", {
      data: { stripe_connect_account_id: "acct_seller" },
      error: null,
    });
    // 5) pricing_tiers
    enqueue("pricing_tiers", { data: [], error: null });
    // 6) chargeable commitments query — empty (everything was already confirmed before this run)
    enqueue("commitments", { data: [], error: null });
    // 7) campaign update — should be settled, NOT failed
    enqueue("campaigns", { data: null, error: null });
    // 8) lot update — should be settled, NOT failed
    enqueue("lots", { data: null, error: null });
    // 9) success notifications: lot fetch
    enqueue("lots", {
      data: { id: "lot-1", title: "Test Lot", seller_id: "seller-1", committed_quantity_kg: 100 },
      error: null,
    });
    // 10) seller profile for emails
    enqueue("profiles", { data: { email: "seller@test", contact_name: "Seller" }, error: null });
    // 11) confirmed commitments for emails
    enqueue("commitments", { data: [], error: null });
    // 12) hub fetch for emails
    enqueue("hubs", {
      data: { id: "hub-1", name: "Hub", address: null, city: null, state: null, country: null, owner_id: "owner-1" },
      error: null,
    });
    // 13) hub owner profile
    enqueue("profiles", { data: { email: "owner@test", contact_name: "Owner" }, error: null });

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.processed_campaigns).toBe(1);
    expect(body.results[0]).toMatchObject({
      campaign_id: "camp-1",
      lot_id: "lot-1",
      outcome: "settled",
      orphans_cancelled: 1,
    });

    // Orphan was cancelled with status='cancelled' so the lot trigger drops its qty.
    const orphanCancel = updateCalls.find(
      (c) => c.table === "commitments" && c.eqId === "orphan-1"
    );
    expect(orphanCancel?.payload).toMatchObject({
      status: "cancelled",
      payment_status: "cancelled",
    });

    // Campaign was marked settled — the regression we're guarding against
    // (it used to be marked 'failed' because the orphan inflated failedCount).
    const campaignUpdate = updateCalls.find((c) => c.table === "campaigns");
    expect(campaignUpdate?.payload).toMatchObject({ status: "settled" });

    // Lot was marked settled, not failed.
    const lotUpdate = updateCalls.find((c) => c.table === "lots");
    expect(lotUpdate?.payload).toMatchObject({
      status: "closed",
      settlement_status: "settled",
    });
  });

  it("with NO orphans, behavior is unchanged (campaign settles cleanly)", async () => {
    enqueue("platform_settings", {
      data: { platform_connect_account_id: "acct_platform" },
      error: null,
    });
    enqueue("profiles", { data: [], error: null });
    enqueue("campaigns", {
      data: [
        {
          id: "camp-2",
          lot_id: "lot-2",
          hub_id: "hub-2",
          deadline: new Date(Date.now() - 60_000).toISOString(),
          status: "active",
        },
      ],
      error: null,
    });
    enqueue("commitments", { data: [], error: null }); // no orphans
    enqueue("lots", {
      data: {
        id: "lot-2",
        seller_id: "seller-2",
        status: "active",
        currency: "usd",
        price_per_kg: 10,
        committed_quantity_kg: 75,
        min_commitment_kg: 50,
        commitment_deadline: new Date(Date.now() - 60_000).toISOString(),
        settlement_status: "pending",
        expiry_date: new Date(Date.now() - 60_000).toISOString(),
      },
      error: null,
    });
    enqueue("profiles", { data: { stripe_connect_account_id: "acct_seller" }, error: null });
    enqueue("pricing_tiers", { data: [], error: null });
    enqueue("commitments", { data: [], error: null });
    enqueue("campaigns", { data: null, error: null });
    enqueue("lots", { data: null, error: null });
    enqueue("lots", {
      data: { id: "lot-2", title: "T", seller_id: "seller-2", committed_quantity_kg: 75 },
      error: null,
    });
    enqueue("profiles", { data: { email: "s@t", contact_name: "S" }, error: null });
    enqueue("commitments", { data: [], error: null });
    enqueue("hubs", {
      data: { id: "hub-2", name: "H", address: null, city: null, state: null, country: null, owner_id: "o" },
      error: null,
    });
    enqueue("profiles", { data: { email: "o@t", contact_name: "O" }, error: null });

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0]).toMatchObject({ outcome: "settled", orphans_cancelled: 0 });
  });
});

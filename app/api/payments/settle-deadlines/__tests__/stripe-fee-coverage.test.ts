/**
 * CrowdRoast covers Stripe processing fees out of its own platform share.
 *
 * This test verifies that on the success path, the fee fetched from
 * BalanceTransaction is deducted from the CrowdRoast platform transfer
 * (so seller and hub receive their full split) and persisted on the
 * commitment row for accounting.
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
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
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

const { createTransferMock, createRefundMock, getChargeFeeCentsMock } = vi.hoisted(() => ({
  createTransferMock: vi.fn().mockResolvedValue({ id: "tr_x" }),
  createRefundMock: vi.fn().mockResolvedValue({ id: "re_x" }),
  getChargeFeeCentsMock: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  getConnectedAccount: vi.fn().mockResolvedValue({
    capabilities: { transfers: "active" },
  }),
  getPaymentIntent: vi.fn().mockResolvedValue({
    latest_charge: "ch_test_123",
    status: "succeeded",
  }),
  getChargeFeeCents: getChargeFeeCentsMock,
  listRefundsForPaymentIntent: vi.fn().mockResolvedValue({ data: [] }),
  listTransfersForSourceCharge: vi.fn().mockResolvedValue({ data: [] }),
  createTransfer: createTransferMock,
  createRefund: createRefundMock,
}));

// Deterministic numbers so the test can assert exact transfer cent values.
// Gross $137.50 → seller $125 (base), hub $2.75 (2%), platform $9.75.
// Fee $4.28 (~Stripe US: 2.9% + $0.30) → CrowdRoast keeps $9.75 - $4.28 = $5.47.
vi.mock("@/lib/payments/settlement-logic", async () => {
  const actual = await vi.importActual<typeof import("@/lib/payments/settlement-logic")>(
    "@/lib/payments/settlement-logic"
  );
  return {
    ...actual,
    getFinalPricePerKg: vi.fn(() => 12.5),
    computeChargeAdjustment: vi.fn(() => ({
      committedAmountCents: 13750,
      finalAmountCents: 13750,
      refundAmountCents: 0,
    })),
    computeSellerNetAmountCents: vi.fn(() => 12500),
    computeSplit: vi.fn(() => ({ sellerAmount: 12500, hubAmount: 275, platformAmount: 975 })),
    // applyStripeFeeToPlatformShare uses the real implementation from `actual`.
  };
});

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
  applyInviterCreditOnSettle: vi.fn(async (_admin, args: { platformAmountCents: number }) => ({
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

function enqueueSettlingCampaign() {
  enqueue("platform_settings", {
    data: { platform_connect_account_id: "acct_crowdroast" },
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
  // 1) orphan query — none
  enqueue("commitments", { data: [], error: null });
  // 2) lot fetch — minimum met
  enqueue("lots", {
    data: {
      id: "lot-1",
      seller_id: "seller-1",
      status: "active",
      currency: "usd",
      price_per_kg: 12.5,
      committed_quantity_kg: 100,
      min_commitment_kg: 50,
      commitment_deadline: new Date(Date.now() - 60_000).toISOString(),
      settlement_status: "pending",
      expiry_date: new Date(Date.now() - 60_000).toISOString(),
    },
    error: null,
  });
  // 3) seller profile
  enqueue("profiles", {
    data: { stripe_connect_account_id: "acct_seller" },
    error: null,
  });
  // 4) pricing tiers
  enqueue("pricing_tiers", { data: [], error: null });
  // 5) chargeable commitments — one settled buyer
  enqueue("commitments", {
    data: [
      {
        id: "commit-1",
        buyer_id: "buyer-1",
        status: "active",
        payment_status: "charge_succeeded",
        hub_id: "hub-1",
        quantity_kg: 10,
        total_price: 137.5,
        charge_amount_cents: 13750,
        charge_currency: "usd",
        stripe_charge_id: "ch_test_123",
        stripe_payment_intent_id: "pi_test_123",
      },
    ],
    error: null,
  });
  // 6) hub fetch
  enqueue("hubs", { data: { owner_id: "hub-owner-1" }, error: null });
  // 7) hub-owner profile (Connect account for hub)
  enqueue("profiles", {
    data: { stripe_connect_account_id: "acct_hub" },
    error: null,
  });
  // 8) commitment update on confirm — observed via updateCalls
  enqueue("commitments", { data: null, error: null });
  // 9) success notifications: lot fetch
  enqueue("lots", {
    data: { id: "lot-1", title: "Test Lot", seller_id: "seller-1", committed_quantity_kg: 100 },
    error: null,
  });
  enqueue("profiles", { data: { email: "seller@test", contact_name: "Seller" }, error: null });
  enqueue("commitments", { data: [], error: null });
  enqueue("hubs", {
    data: {
      id: "hub-1",
      name: "Hub",
      address: null,
      city: null,
      state: null,
      country: null,
      owner_id: "hub-owner-1",
    },
    error: null,
  });
  enqueue("profiles", { data: { email: "owner@test", contact_name: "Owner" }, error: null });
}

describe("settle-deadlines — Stripe fee coverage", () => {
  it("deducts the Stripe processing fee from the CrowdRoast platform transfer", async () => {
    getChargeFeeCentsMock.mockResolvedValueOnce(428); // $4.28 typical US card fee
    enqueueSettlingCampaign();

    const res = await POST(makeReq());
    expect(res.status).toBe(200);

    // Three transfers: seller ($125), hub ($2.75), CrowdRoast ($9.75 - $4.28 = $5.47)
    expect(createTransferMock).toHaveBeenCalledTimes(3);

    const sellerTransfer = createTransferMock.mock.calls.find(
      ([args]) => args.role === "seller"
    )?.[0];
    expect(sellerTransfer).toMatchObject({ amountCents: 12500, role: "seller" });

    const hubTransfer = createTransferMock.mock.calls.find(([args]) => args.role === "hub")?.[0];
    expect(hubTransfer).toMatchObject({ amountCents: 275, role: "hub" });

    const platformTransfer = createTransferMock.mock.calls.find(
      ([args]) => args.role === "crowdroast"
    )?.[0];
    expect(platformTransfer).toMatchObject({ amountCents: 547, role: "crowdroast" });

    // Confirm update persists the actual fee for accounting.
    const confirmUpdate = updateCalls.find(
      (c) => c.table === "commitments" && c.eqId === "commit-1"
    );
    expect(confirmUpdate?.payload).toMatchObject({
      status: "confirmed",
      stripe_fee_cents: 428,
    });
  });

  it("falls back to a 0 fee deduction when BalanceTransaction lookup fails", async () => {
    getChargeFeeCentsMock.mockRejectedValueOnce(new Error("balance_transaction not ready"));
    enqueueSettlingCampaign();

    const res = await POST(makeReq());
    expect(res.status).toBe(200);

    // Without a known fee, CrowdRoast transfers the full unadjusted platform share.
    // The next cron pass that learns the real fee will book the deduction.
    const platformTransfer = createTransferMock.mock.calls.find(
      ([args]) => args.role === "crowdroast"
    )?.[0];
    expect(platformTransfer).toMatchObject({ amountCents: 975, role: "crowdroast" });

    const confirmUpdate = updateCalls.find(
      (c) => c.table === "commitments" && c.eqId === "commit-1"
    );
    // Persisted as null (unknown) rather than 0, so reporting can flag it.
    expect(confirmUpdate?.payload).toMatchObject({ stripe_fee_cents: null });
  });
});

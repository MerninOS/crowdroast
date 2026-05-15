/**
 * Regression test for the bag-aware orphan-cancellation bug.
 *
 * Symptom (reported by Mernin'):
 *   * No `commitment_bag_charges` rows are created when settle-deadlines runs.
 *   * The process-bag-charges cron has nothing to do.
 *   * Bag-aware lots whose minimum bags WAS met are marked as
 *     "min not met" (`reason: 'below_min_bags'`).
 *
 * Root cause:
 *   The orphan-cancellation step at the top of settle-deadlines was keyed off
 *   `stripe_payment_intent_id IS NULL`. That field is NULL on every bag-aware
 *   commitment by design — bag-aware commits use `stripe_setup_intent_id` +
 *   `stripe_payment_method_id` at commit time, and the payment intent is only
 *   created later by the per-bag charge worker at settlement. So the orphan
 *   step was cancelling every legitimate `setup_complete` bag-aware commit,
 *   driving `lot.committed_quantity_kg` to 0 via the lot trigger, which then
 *   tripped the bag-aware branch's `completed_bags < min_bags_to_succeed`
 *   gate and marked the campaign failed before any `commitment_bag_charges`
 *   rows could be inserted.
 *
 * Fix:
 *   The orphan criterion now matches the lot trigger (migration #45):
 *   `payment_status NOT IN ('setup_complete','charge_succeeded')`. A commit
 *   counts as "real" iff its payment_status is one of those two values; any
 *   other state means the buyer didn't finish payment setup. This works for
 *   both bag-aware (`setup_complete`) and legacy (`charge_succeeded`) flows.
 *
 * This test asserts the orphan query carries the new filter shape — anything
 * that re-introduces the old `stripe_payment_intent_id IS NULL` criterion
 * will fail this test before it can re-break production settlement.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

type FilterCall = { method: string; args: unknown[] };
type ChainCall = { table: string; filters: FilterCall[] };

const chainCalls: ChainCall[] = [];
const fromQueue: Array<() => Record<string, unknown>> = [];
let pendingTable: string | null = null;

function makeChain(response: { data: unknown; error: unknown; count?: number | null }) {
  const table = pendingTable!;
  const filters: FilterCall[] = [];
  chainCalls.push({ table, filters });
  let pendingPayload: Record<string, unknown> | null = null;

  const chain: Record<string, unknown> = {
    update: vi.fn((p: Record<string, unknown>) => {
      pendingPayload = p;
      return chain;
    }),
    upsert: vi.fn(() =>
      Promise.resolve({
        data: response.data,
        error: response.error,
        count: response.count ?? null,
      })
    ),
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn((...args: unknown[]) => {
      filters.push({ method: "eq", args });
      return chain;
    }),
    neq: vi.fn((...args: unknown[]) => {
      filters.push({ method: "neq", args });
      return chain;
    }),
    in: vi.fn((...args: unknown[]) => {
      filters.push({ method: "in", args });
      return chain;
    }),
    is: vi.fn((...args: unknown[]) => {
      filters.push({ method: "is", args });
      return chain;
    }),
    lte: vi.fn((...args: unknown[]) => {
      filters.push({ method: "lte", args });
      return chain;
    }),
    not: vi.fn((...args: unknown[]) => {
      filters.push({ method: "not", args });
      return chain;
    }),
    order: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(() => Promise.resolve(response)),
    single: vi.fn(() => Promise.resolve(response)),
    then: (resolve: (v: unknown) => void) => {
      // Consume pendingPayload reference so the lint doesn't flag it. We
      // don't need to assert update payloads in this test.
      void pendingPayload;
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

vi.mock("@/lib/stripe", () => ({
  getConnectedAccount: vi
    .fn()
    .mockResolvedValue({ capabilities: { transfers: "active" } }),
  getPaymentIntent: vi.fn().mockResolvedValue({ latest_charge: null }),
  getChargeFeeCents: vi.fn().mockResolvedValue(0),
  listRefundsForPaymentIntent: vi.fn().mockResolvedValue({ data: [] }),
  listTransfersForSourceCharge: vi.fn().mockResolvedValue({ data: [] }),
  createTransfer: vi.fn().mockResolvedValue({ id: "tr_x" }),
  createRefund: vi.fn().mockResolvedValue({ id: "re_x" }),
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
    async (_admin, args: { platformAmountCents: number }) => ({
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
  chainCalls.length = 0;
  fromQueue.length = 0;
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

describe("settle-deadlines — bag-aware orphan filter regression", () => {
  it("orphan query keys off payment_status (not stripe_payment_intent_id), so successful bag-aware commits survive", async () => {
    // Pre-cron setup
    enqueue("platform_settings", {
      data: { platform_connect_account_id: "acct_platform" },
      error: null,
    });
    enqueue("profiles", { data: [], error: null });
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
    // 1) orphan query — returns nothing because all surviving commits are
    //    payment_status='setup_complete' (the bag-aware happy state).
    enqueue("commitments", { data: [], error: null });
    // 2) lot fetch — bag-aware, 60kg bags, 120kg committed, min 1 bag
    enqueue("lots", {
      data: {
        id: "lot-1",
        title: "Bag-aware Lot",
        seller_id: "seller-1",
        status: "active",
        currency: "usd",
        price_per_kg: 10,
        committed_quantity_kg: 120,
        min_commitment_kg: 60,
        commitment_deadline: new Date(Date.now() - 60_000).toISOString(),
        bag_size_kg: 60,
        min_bags_to_succeed: 1,
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
    // 5) bag-aware commitments query
    enqueue("commitments", {
      data: [
        { id: "commit-A", quantity_kg: 60, created_at: "2026-04-01T10:00:00.000Z" },
        { id: "commit-B", quantity_kg: 60, created_at: "2026-04-02T10:00:00.000Z" },
      ],
      error: null,
    });
    // 6) commitment_bag_charges upsert — should insert 2 rows
    enqueue("commitment_bag_charges", {
      data: null,
      error: null,
      count: 2,
    });
    // 7-8) kg_locked_at_settlement (+ status='confirmed') stamps
    enqueue("commitments", { data: null, error: null });
    enqueue("commitments", { data: null, error: null });
    // Unallocated-commits SELECT — both commits got bags, no rows to cancel.
    enqueue("commitments", { data: [], error: null });

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();

    // The bag-aware happy path completed — commitment_bag_charges rows were
    // inserted. If the orphan filter were still keyed off
    // stripe_payment_intent_id, every bag-aware commit would have been
    // cancelled, completed_bags would have been 0, and the result would have
    // been outcome:'failed' with reason:'below_min_bags' instead.
    expect(body.results[0]).toMatchObject({
      campaign_id: "camp-1",
      lot_id: "lot-1",
      outcome: "settled",
      completed_bags: 2,
      bag_charges_planned: 2,
      bag_charges_inserted: 2,
    });

    // Inspect the orphan query's filter shape. It should use the new
    // payment_status-based criterion, not the legacy stripe_payment_intent_id
    // criterion.
    //
    // The orphan query is the first commitments-table query of the run —
    // chainCalls[3] (after platform_settings, profiles, campaigns).
    const orphanQuery = chainCalls[3];
    expect(orphanQuery.table).toBe("commitments");

    // The new criterion: .not("payment_status", "in", "(setup_complete,charge_succeeded)")
    const notFilter = orphanQuery.filters.find((f) => f.method === "not");
    expect(notFilter).toBeDefined();
    expect(notFilter?.args[0]).toBe("payment_status");
    expect(notFilter?.args[1]).toBe("in");
    expect(notFilter?.args[2]).toBe("(setup_complete,charge_succeeded)");

    // Guardrail: the legacy `.is("stripe_payment_intent_id", null)` filter
    // must NOT be present anymore. If it is, we re-broke the bug.
    const stripePiIsNull = orphanQuery.filters.find(
      (f) =>
        f.method === "is" &&
        f.args[0] === "stripe_payment_intent_id" &&
        f.args[1] === null
    );
    expect(stripePiIsNull).toBeUndefined();
  });
});

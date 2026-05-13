/**
 * Task 4.15 — Bag-aware lifecycle integration test (happy path).
 *
 * Scope: a single GLUE test that wires the full bag-aware settlement
 * lifecycle end-to-end on a clean happy path:
 *
 *     settle-deadlines POST
 *           │
 *           ▼  inserts commitment_bag_charges rows
 *     processBagCharge × N    (one per row, in order)
 *           │
 *           ▼  on terminal `charged`
 *     transferOutBagIfReady   (fires once per completed bag)
 *     sendSettlementEmailIfReady  (fires once per completed commitment)
 *
 * Edge cases (retry ladder, decline, transient, auth-probe-fail, below-
 * min-bags failure, partial bag refund) are already covered in:
 *   - lib/__tests__/charge-worker.test.ts
 *   - lib/__tests__/bag-transfer-out.test.ts
 *   - lib/__tests__/settlement-email-trigger.test.ts
 *   - app/api/payments/settle-deadlines/__tests__/bag-aware-below-min-bags.test.ts
 *
 * This file is intentionally narrow: prove that on the happy path, the
 * three layers connect correctly and the right side-effects fire in the
 * right order — nothing more.
 *
 * Scenario:
 *   Lot: bag_size_kg=60, total committed=120kg, min_bags_to_succeed=1.
 *   No pricing tiers — base price $10/kg, resolved tier = base.
 *   Three buyers (chronological order):
 *     • Buyer A — 60kg commit → fills bag 1 entirely.
 *     • Buyer B — 30kg commit → first half of bag 2.
 *     • Buyer C — 30kg commit → second half of bag 2.
 *   All cards pass auth probe. Every Stripe charge succeeds first attempt.
 *
 *   Expected commitment_bag_charges rows after settlement:
 *     • commit-A / bag 1 / 60kg
 *     • commit-B / bag 2 / 30kg
 *     • commit-C / bag 2 / 30kg
 *
 *   Per-row buyer-paid amount = round(kg × $10 × 1.10 × 100) cents
 *   (the +10% platform fee — see route.ts comments). Verified in-test.
 *
 * Mocking strategy mirrors the existing tests' layered approach:
 *   - Supabase: chain-stub with a pre-staged response queue. We use two
 *     separate queues — one for the route, one for the worker calls —
 *     because the route's chain captures upserts but the worker's chain
 *     captures lease UPDATEs. Sharing one queue would make the assertions
 *     fragile (you'd have to interleave them with knowledge of which
 *     internal call goes when).
 *   - Stripe: mocked at module level for `createAndConfirmPaymentIntent`
 *     (always `succeeded`) and `createBagTransfer` (always succeeds). The
 *     route's Stripe touch points (capability probe etc.) get the same
 *     hoisted mock object.
 *   - transferOutBagIfReady / sendSettlementEmailIfReady are mocked at
 *     module level: the worker imports them and we want to count their
 *     calls, not re-test their internals. They return `'transferred'` and
 *     `'sent'` respectively so the worker logs a clean path.
 *
 * Note: TypeScript's strict mode would normally reject the `any` cast on
 * `makeSupabase()` and the chain stub object. These are confined to the
 * test file — the patterns mirror existing tests (see charge-worker.test.ts
 * lines 60, 124) and the cast is necessary to satisfy SupabaseClient's
 * generic surface without dragging in the full typed-client generation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// -------------------------------------------------------------------------
// Hoisted Stripe mocks. Used by BOTH the settle-deadlines route (capability
// probe, refunds) AND injected as `deps.createAndConfirmPaymentIntent` /
// `deps.createBagTransfer` on the worker / transfer-out calls below. Kept
// in a single object so the test body has a single source of truth for
// "was Stripe called and how?".
// -------------------------------------------------------------------------
const stripeMocks = vi.hoisted(() => ({
  createTransfer: vi.fn().mockResolvedValue({ id: "tr_legacy_x" }),
  createRefund: vi.fn().mockResolvedValue({ id: "re_x" }),
  createBagTransfer: vi.fn().mockResolvedValue({ id: "tr_bag_x" }),
  createAndConfirmPaymentIntent: vi.fn(),
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
  createAndConfirmPaymentIntent: stripeMocks.createAndConfirmPaymentIntent,
}));

// -------------------------------------------------------------------------
// Mock the worker's downstream side-effects at the module level. The unit
// tests for these modules already cover their internals — for this
// integration test we only care that:
//   1. They get called once per (lot, bag) for transfer-out
//   2. They get called once per commitment for settlement-email
// We RESOLVE with the structured-status returns the charge-worker expects
// so its log branches don't false-positive.
// -------------------------------------------------------------------------
const transferOutMock = vi.fn().mockResolvedValue({ status: "transferred" });
const sendSettlementEmailMock = vi.fn().mockResolvedValue({ status: "sent" });

vi.mock("@/lib/bag-transfer-out", () => ({
  transferOutBagIfReady: (...args: unknown[]) => transferOutMock(...args),
}));
vi.mock("@/lib/settlement-email-trigger", () => ({
  sendSettlementEmailIfReady: (...args: unknown[]) =>
    sendSettlementEmailMock(...args),
}));

// Email module — the route imports several helpers; the worker imports
// `sendPaymentUpdateRequiredEmail`. None should fire on the happy path,
// but they need to resolve to keep imports green.
vi.mock("@/lib/email", () => ({
  sendLotClosedEmailsBatch: vi.fn().mockResolvedValue({ success: true }),
  sendLotFailedEmail: vi.fn().mockResolvedValue({ success: true }),
  sendReferralCreditEarnedEmail: vi.fn().mockResolvedValue({ success: true }),
  sendPaymentUpdateRequiredEmail: vi.fn().mockResolvedValue({ success: true }),
  sendCampaignSettledEmail: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/auth/admin", () => ({
  getConfiguredAdminEmails: () => ["admin@test.local"],
}));

vi.mock("@/lib/shipments", () => ({
  createShipmentForLot: vi.fn().mockResolvedValue({ ok: true }),
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

// -------------------------------------------------------------------------
// Route-side Supabase chain stub. Drives the settle-deadlines POST through
// the bag-aware happy path and captures the upsert payload into
// commitment_bag_charges.
//
// Pattern copied from bag-aware-below-min-bags.test.ts (which copied it
// from orphan-cancellation.test.ts). Each from(table) call dequeues the
// next pre-staged response; the chain captures the upsert rows so the
// test body can inspect them.
// -------------------------------------------------------------------------

type UpsertRecord = { table: string; rows: unknown[]; options?: unknown };
type UpdateRecord = { table: string; payload: Record<string, unknown>; eqId?: unknown };

const routeUpserts: UpsertRecord[] = [];
const routeUpdates: UpdateRecord[] = [];
const routeFromQueue: Array<() => Record<string, unknown>> = [];
let routePendingTable: string | null = null;

function makeRouteChain(response: {
  data: unknown;
  error: unknown;
  count?: number | null;
}) {
  let pendingPayload: Record<string, unknown> | null = null;
  let pendingEqId: unknown = undefined;
  const table = routePendingTable!;
  const chain: Record<string, unknown> = {
    update: vi.fn((p: Record<string, unknown>) => {
      pendingPayload = p;
      return chain;
    }),
    upsert: vi.fn((rows: unknown[], options?: unknown) => {
      routeUpserts.push({ table, rows, options });
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
        routeUpdates.push({ table, payload: pendingPayload, eqId: pendingEqId });
      return Promise.resolve(response);
    }),
    single: vi.fn(() => {
      if (pendingPayload)
        routeUpdates.push({ table, payload: pendingPayload, eqId: pendingEqId });
      return Promise.resolve(response);
    }),
    then: (resolve: (v: unknown) => void) => {
      if (pendingPayload)
        routeUpdates.push({ table, payload: pendingPayload, eqId: pendingEqId });
      return Promise.resolve(response).then(resolve);
    },
  };
  return chain;
}

function enqueueRoute(
  table: string,
  response: { data: unknown; error: unknown; count?: number | null }
) {
  routeFromQueue.push(() => {
    routePendingTable = table;
    return makeRouteChain(response);
  });
}

type RpcCall = { fn: string; args: unknown };
const rpcCalls: RpcCall[] = [];

// Tables the route may touch incidentally (referral feature, credit
// ledger) without us pre-staging a response: serve a benign empty result
// rather than throwing.
const PASSIVE_ROUTE_TABLES = new Set([
  "referral_attributions",
  "credit_ledger",
]);

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      const next = routeFromQueue.shift();
      if (!next) {
        if (PASSIVE_ROUTE_TABLES.has(table)) {
          routePendingTable = table;
          return makeRouteChain({ data: [], error: null });
        }
        throw new Error(`Unexpected route from(${table}) — queue empty`);
      }
      return next();
    }),
    rpc: vi.fn((fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve({ data: null, error: null });
    }),
  })),
}));

// -------------------------------------------------------------------------
// Worker-side Supabase chain stub. Distinct from the route's stub because
// the worker's per-row I/O sequence (lease UPDATE → commitment SELECT →
// final UPDATE) is unrelated to the route's queries and shares no rows.
// Pattern copied from charge-worker.test.ts. Capture is per-call.
// -------------------------------------------------------------------------

type WorkerUpdate = {
  table: string;
  payload: Record<string, unknown>;
  eqId?: unknown;
  inStatuses?: unknown;
};
const workerCaptured: WorkerUpdate[] = [];
const workerFromQueue: Array<() => Record<string, unknown>> = [];
let workerPendingTable: string | null = null;

function makeWorkerChain(response: { data: unknown; error: unknown }) {
  let pendingPayload: Record<string, unknown> | null = null;
  let pendingEqId: unknown = undefined;
  let pendingInStatuses: unknown = undefined;
  const tableNow = workerPendingTable!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    update: vi.fn((p: Record<string, unknown>) => {
      pendingPayload = p;
      return chain;
    }),
    select: vi.fn(() => chain),
    eq: vi.fn((col: string, val: unknown) => {
      if (col === "id") pendingEqId = val;
      return chain;
    }),
    in: vi.fn((_col: string, vals: unknown) => {
      pendingInStatuses = vals;
      return chain;
    }),
    or: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    is: vi.fn(() => chain),
    maybeSingle: vi.fn(() => {
      if (pendingPayload) {
        workerCaptured.push({
          table: tableNow,
          payload: pendingPayload,
          eqId: pendingEqId,
          inStatuses: pendingInStatuses,
        });
      }
      return Promise.resolve(response);
    }),
    single: vi.fn(() => {
      if (pendingPayload) {
        workerCaptured.push({
          table: tableNow,
          payload: pendingPayload,
          eqId: pendingEqId,
          inStatuses: pendingInStatuses,
        });
      }
      return Promise.resolve(response);
    }),
    then: (resolve: (v: unknown) => void) => {
      if (pendingPayload) {
        workerCaptured.push({
          table: tableNow,
          payload: pendingPayload,
          eqId: pendingEqId,
          inStatuses: pendingInStatuses,
        });
      }
      return Promise.resolve(response).then(resolve);
    },
  };
  return chain;
}

function enqueueWorker(
  table: string,
  response: { data: unknown; error: unknown }
) {
  workerFromQueue.push(() => {
    workerPendingTable = table;
    return makeWorkerChain(response);
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeWorkerSupabase(): any {
  return {
    from: vi.fn((table: string) => {
      const next = workerFromQueue.shift();
      if (!next) {
        throw new Error(`Unexpected worker from(${table}) — queue empty`);
      }
      return next();
    }),
  };
}

// -------------------------------------------------------------------------
// Module-under-test imports — must come AFTER vi.mock declarations above.
// -------------------------------------------------------------------------
import { POST } from "@/app/api/payments/settle-deadlines/route";
import { processBagCharge, type BagChargeRow } from "@/lib/charge-worker";

const CRON_SECRET = "test-secret";
const FIXED_NOW = new Date("2026-05-13T12:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  routeUpserts.length = 0;
  routeUpdates.length = 0;
  routeFromQueue.length = 0;
  workerCaptured.length = 0;
  workerFromQueue.length = 0;
  rpcCalls.length = 0;
  routePendingTable = null;
  workerPendingTable = null;
  transferOutMock.mockResolvedValue({ status: "transferred" });
  sendSettlementEmailMock.mockResolvedValue({ status: "sent" });
  stripeMocks.createAndConfirmPaymentIntent.mockReset();
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

describe("settle-deadlines bag-aware lifecycle integration (Task 4.15)", () => {
  it("settle → worker × N → transfer-out + settlement-email all wire up on happy path", async () => {
    // ------------------------------------------------------------------
    // Phase 1: drive the route through settlement.
    // ------------------------------------------------------------------
    // Pre-cron platform setup queries.
    enqueueRoute("platform_settings", {
      data: { platform_connect_account_id: "acct_platform" },
      error: null,
    });
    enqueueRoute("profiles", { data: [], error: null });
    enqueueRoute("campaigns", {
      data: [
        {
          id: "camp-1",
          lot_id: "lot-1",
          hub_id: "hub-1",
          deadline: new Date(FIXED_NOW.getTime() - 60_000).toISOString(),
          status: "active",
        },
      ],
      error: null,
    });

    // Per-campaign sequence (bag-aware happy path):
    //   1) orphan query — none.
    //   2) lot fetch — bag-aware, 60kg bags, 120kg committed, min 1 bag.
    //   3) seller profile.
    //   4) pricing_tiers — empty (base price applies).
    //   5) bag-aware commitments query — three buyers in chronological order.
    //   6) commitment_bag_charges upsert.
    //   7-9) kg_locked_at_settlement stamps — one per commitment.
    enqueueRoute("commitments", { data: [], error: null }); // orphan query
    enqueueRoute("lots", {
      data: {
        id: "lot-1",
        title: "Honduras Catuai",
        seller_id: "seller-1",
        status: "active",
        currency: "usd",
        price_per_kg: 10,
        committed_quantity_kg: 120,
        min_commitment_kg: 60,
        commitment_deadline: new Date(FIXED_NOW.getTime() - 60_000).toISOString(),
        bag_size_kg: 60,
        min_bags_to_succeed: 1,
      },
      error: null,
    });
    enqueueRoute("profiles", {
      data: { stripe_connect_account_id: "acct_seller" },
      error: null,
    });
    enqueueRoute("pricing_tiers", { data: [], error: null });
    enqueueRoute("commitments", {
      data: [
        {
          id: "commit-A",
          quantity_kg: 60,
          created_at: "2026-04-01T10:00:00.000Z",
        },
        {
          id: "commit-B",
          quantity_kg: 30,
          created_at: "2026-04-02T10:00:00.000Z",
        },
        {
          id: "commit-C",
          quantity_kg: 30,
          created_at: "2026-04-03T10:00:00.000Z",
        },
      ],
      error: null,
    });
    enqueueRoute("commitment_bag_charges", {
      data: null,
      error: null,
      count: 3,
    });
    // Three kg_locked_at_settlement stamps — order matches the Map's
    // insertion order which mirrors the portion expansion: A → B → C.
    enqueueRoute("commitments", { data: null, error: null });
    enqueueRoute("commitments", { data: null, error: null });
    enqueueRoute("commitments", { data: null, error: null });

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();

    // The route should report bag-aware success.
    expect(body.processed_campaigns).toBe(1);
    expect(body.results[0]).toMatchObject({
      campaign_id: "camp-1",
      lot_id: "lot-1",
      outcome: "bag_charges_created",
      bag_size_kg: 60,
      completed_bags: 2,
      price_per_kg: 10,
      bag_charges_planned: 3,
      bag_charges_inserted: 3,
      commitments_stamped: 3,
    });

    // Exactly one upsert into commitment_bag_charges with 3 rows.
    const bagChargesUpserts = routeUpserts.filter(
      (u) => u.table === "commitment_bag_charges"
    );
    expect(bagChargesUpserts).toHaveLength(1);

    type ChargeRowShape = {
      commitment_id: string;
      bag_number: number;
      kg: number;
      amount_cents: number;
      stripe_idempotency_key: string;
      payment_status: "awaiting_charge";
    };
    const insertedRows = bagChargesUpserts[0].rows as ChargeRowShape[];
    expect(insertedRows).toHaveLength(3);

    // Buyer-paid amount = kg × $10 × 1.10 × 100. Same formula as the
    // route's chargeRows builder; encoded inline so a regression in the
    // fee-multiplier surfaces here.
    const expectAmount = (kg: number) => Math.round(kg * 10 * 1.1 * 100);
    expect(insertedRows[0]).toMatchObject({
      commitment_id: "commit-A",
      bag_number: 1,
      kg: 60,
      amount_cents: expectAmount(60),
      stripe_idempotency_key: "charge:campaign:camp-1:commitment:commit-A:bag:1",
      payment_status: "awaiting_charge",
    });
    expect(insertedRows[1]).toMatchObject({
      commitment_id: "commit-B",
      bag_number: 2,
      kg: 30,
      amount_cents: expectAmount(30),
      stripe_idempotency_key: "charge:campaign:camp-1:commitment:commit-B:bag:2",
      payment_status: "awaiting_charge",
    });
    expect(insertedRows[2]).toMatchObject({
      commitment_id: "commit-C",
      bag_number: 2,
      kg: 30,
      amount_cents: expectAmount(30),
      stripe_idempotency_key: "charge:campaign:camp-1:commitment:commit-C:bag:2",
      payment_status: "awaiting_charge",
    });

    // No legacy refunds / transfers should have fired — bag-aware doesn't
    // charge at commit, so there's nothing to refund.
    expect(stripeMocks.createRefund).not.toHaveBeenCalled();
    expect(stripeMocks.createTransfer).not.toHaveBeenCalled();

    // No partial-bag kg_refunded_at_settlement stamps either — total
    // committed is exactly 2 bags, no incomplete bag.
    const partialRefundStamps = routeUpdates.filter(
      (u) =>
        u.table === "commitments" &&
        Object.prototype.hasOwnProperty.call(
          u.payload,
          "kg_refunded_at_settlement"
        )
    );
    expect(partialRefundStamps).toHaveLength(0);

    // ------------------------------------------------------------------
    // Phase 2: iterate the worker over each inserted row.
    // ------------------------------------------------------------------
    // We process A → B → C — the same order the cron worker would when
    // selecting by next_attempt_at (all three have NULL → tied).
    //
    // For each row, the worker runs three Supabase calls:
    //   1) lease UPDATE on commitment_bag_charges (returns {id})
    //   2) commitments SELECT (returns the joined commitment row)
    //   3) final UPDATE on commitment_bag_charges (returns ok)
    // Plus the module-mocked transferOutBagIfReady + sendSettlementEmailIfReady.
    stripeMocks.createAndConfirmPaymentIntent
      .mockResolvedValueOnce({ id: "pi_A_bag1", status: "succeeded" })
      .mockResolvedValueOnce({ id: "pi_B_bag2", status: "succeeded" })
      .mockResolvedValueOnce({ id: "pi_C_bag2", status: "succeeded" });

    function chargeRowFrom(r: ChargeRowShape): BagChargeRow {
      return {
        id: `${r.commitment_id}-bag${r.bag_number}`,
        commitment_id: r.commitment_id,
        bag_number: r.bag_number,
        kg: r.kg,
        amount_cents: r.amount_cents,
        stripe_payment_intent_id: null,
        stripe_idempotency_key: r.stripe_idempotency_key,
        payment_status: "awaiting_charge",
        attempt_count: 0,
        next_attempt_at: null,
        failed_reason: null,
        payment_update_email_sent_at: null,
      };
    }

    const buyerCommitmentJoin = (commitmentId: string) => ({
      stripe_payment_method_id: `pm_${commitmentId}`,
      stripe_customer_id: `cus_${commitmentId}`,
      charge_currency: "usd",
      payment_error: null,
      lot_id: "lot-1",
      buyer: { email: `${commitmentId}@example.com`, contact_name: commitmentId },
      lot: { title: "Honduras Catuai" },
    });

    const workerSupabase = makeWorkerSupabase();
    const outcomes: string[] = [];

    for (const row of insertedRows) {
      // Pre-stage the per-row I/O the worker performs.
      enqueueWorker("commitment_bag_charges", {
        data: { id: row.commitment_id }, // lease "leased" sentinel
        error: null,
      });
      enqueueWorker("commitments", {
        data: buyerCommitmentJoin(row.commitment_id),
        error: null,
      });
      enqueueWorker("commitment_bag_charges", { data: null, error: null });

      const result = await processBagCharge(
        workerSupabase,
        chargeRowFrom(row),
        {
          createAndConfirmPaymentIntent: stripeMocks.createAndConfirmPaymentIntent,
          now: () => FIXED_NOW,
        }
      );
      outcomes.push(result.outcome);
    }

    // ------------------------------------------------------------------
    // Phase 3: assert the integrated behavior.
    // ------------------------------------------------------------------
    // All three rows landed `charged` on the first attempt.
    expect(outcomes).toEqual(["charged", "charged", "charged"]);

    // Stripe charge called once per row with the right idempotency key.
    expect(stripeMocks.createAndConfirmPaymentIntent).toHaveBeenCalledTimes(3);
    expect(stripeMocks.createAndConfirmPaymentIntent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        amountCents: expectAmount(60),
        currency: "usd",
        customerId: "cus_commit-A",
        paymentMethodId: "pm_commit-A",
        commitmentId: "commit-A",
        lotId: "lot-1",
        idempotencyKey: "charge:campaign:camp-1:commitment:commit-A:bag:1",
      })
    );
    expect(stripeMocks.createAndConfirmPaymentIntent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        amountCents: expectAmount(30),
        commitmentId: "commit-B",
        idempotencyKey: "charge:campaign:camp-1:commitment:commit-B:bag:2",
      })
    );
    expect(stripeMocks.createAndConfirmPaymentIntent).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        amountCents: expectAmount(30),
        commitmentId: "commit-C",
        idempotencyKey: "charge:campaign:camp-1:commitment:commit-C:bag:2",
      })
    );

    // Each row's final UPDATE wrote payment_status='charged' with the
    // intent id and attempt_count=1. The lease UPDATE precedes the final
    // UPDATE so we look at every-other capture.
    const finalUpdates = workerCaptured.filter(
      (c) =>
        c.table === "commitment_bag_charges" &&
        c.payload.payment_status === "charged"
    );
    expect(finalUpdates).toHaveLength(3);
    expect(finalUpdates[0].payload).toMatchObject({
      payment_status: "charged",
      stripe_payment_intent_id: "pi_A_bag1",
      attempt_count: 1,
      failed_reason: null,
      next_attempt_at: null,
    });
    expect(finalUpdates[1].payload).toMatchObject({
      payment_status: "charged",
      stripe_payment_intent_id: "pi_B_bag2",
    });
    expect(finalUpdates[2].payload).toMatchObject({
      payment_status: "charged",
      stripe_payment_intent_id: "pi_C_bag2",
    });

    // transferOutBagIfReady fires after EVERY terminal-`charged` exit
    // (it's an idempotent "is the bag done?" check). So we expect 3 calls
    // — one per row. Bag 1 completes after row 1 (single 60kg portion);
    // bag 2 only fully completes after row 3, but rows 1, 2, 3 each
    // trigger the check.
    expect(transferOutMock).toHaveBeenCalledTimes(3);
    expect(transferOutMock).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      { commitmentId: "commit-A", bagNumber: 1 }
    );
    expect(transferOutMock).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      { commitmentId: "commit-B", bagNumber: 2 }
    );
    expect(transferOutMock).toHaveBeenNthCalledWith(
      3,
      expect.anything(),
      { commitmentId: "commit-C", bagNumber: 2 }
    );

    // sendSettlementEmailIfReady also fires after every terminal exit —
    // it returns 'not_ready' until the commitment's last sibling lands.
    // In this scenario every commit has exactly one bag-charge row, so
    // each commit's first (and only) row completes the commit; 3 calls,
    // one per buyer.
    expect(sendSettlementEmailMock).toHaveBeenCalledTimes(3);
    expect(sendSettlementEmailMock).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      "commit-A"
    );
    expect(sendSettlementEmailMock).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      "commit-B"
    );
    expect(sendSettlementEmailMock).toHaveBeenNthCalledWith(
      3,
      expect.anything(),
      "commit-C"
    );

    // No Stripe refunds — happy path doesn't refund anything.
    expect(stripeMocks.createRefund).not.toHaveBeenCalled();
    // No legacy createTransfer either (bag-aware uses createBagTransfer,
    // and that's mocked above transferOutBagIfReady so the real one isn't
    // reached).
    expect(stripeMocks.createTransfer).not.toHaveBeenCalled();
  });
});

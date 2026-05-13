/**
 * Tests for `processBagCharge` (lib/charge-worker.ts) — Task 4.8.
 *
 * Covers the AC13 retry ladder (0/12/48h), AC14 terminal payment_failed,
 * crash-safe lease semantics, auth-probe gate, and the transient-vs-decline
 * heuristic.
 *
 * Strategy: build a minimal in-memory Supabase chain stub that captures
 * UPDATE payloads per table, and inject a mock Stripe charge function via
 * the `deps` parameter on `processBagCharge`. Clock is also injected so we
 * can assert specific `next_attempt_at` deltas.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Module-mock the email layer so the worker's AC13 side-effect (sending the
// "update your card" email between attempts 2 and 3) is observable without
// actually hitting Resend. Declared before the worker import so the mock is
// hoisted ahead of the worker's `import { sendPaymentUpdateRequiredEmail }`.
const mockSendPaymentUpdateRequiredEmail = vi.fn();
vi.mock("@/lib/email", () => ({
  sendPaymentUpdateRequiredEmail: (...args: unknown[]) =>
    mockSendPaymentUpdateRequiredEmail(...args),
}));

import {
  processBagCharge,
  type BagChargeRow,
  type ProcessBagChargeDeps,
} from "@/lib/charge-worker";

// -------------------------------------------------------------------------
// Supabase chain stub.
// -------------------------------------------------------------------------
// Each `from(table)` call dequeues the next pre-staged response. The chain
// captures the most recent UPDATE payload and the .in() / .eq() filters so
// tests can assert on what would have been written.

type CapturedUpdate = {
  table: string;
  payload: Record<string, unknown>;
  eqId?: unknown;
  inStatuses?: unknown;
};
type SelectResponse = {
  data: unknown;
  error: unknown;
};

const captured: CapturedUpdate[] = [];
const fromQueue: Array<() => Record<string, unknown>> = [];
let currentTable: string | null = null;

function makeChain(response: SelectResponse) {
  let pendingPayload: Record<string, unknown> | null = null;
  let pendingEqId: unknown = undefined;
  let pendingInStatuses: unknown = undefined;
  const tableNow = currentTable!;
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
        captured.push({
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
        captured.push({
          table: tableNow,
          payload: pendingPayload,
          eqId: pendingEqId,
          inStatuses: pendingInStatuses,
        });
      }
      return Promise.resolve(response);
    }),
    // Awaiting a chain with no terminal selector means a plain UPDATE.
    then: (resolve: (v: unknown) => void) => {
      if (pendingPayload) {
        captured.push({
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

function enqueue(table: string, response: SelectResponse) {
  fromQueue.push(() => {
    currentTable = table;
    return makeChain(response);
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeSupabase(): any {
  return {
    from: vi.fn((table: string) => {
      const next = fromQueue.shift();
      if (!next) {
        throw new Error(`Unexpected from(${table}) — queue empty`);
      }
      return next();
    }),
  };
}

// -------------------------------------------------------------------------
// Fixtures + helpers
// -------------------------------------------------------------------------

const FIXED_NOW = new Date("2026-05-13T12:00:00.000Z");
const FIXED_NOW_MS = FIXED_NOW.getTime();

function mkRow(overrides: Partial<BagChargeRow> = {}): BagChargeRow {
  return {
    id: "charge-1",
    commitment_id: "commit-1",
    bag_number: 1,
    kg: 30,
    amount_cents: 30000,
    stripe_payment_intent_id: null,
    stripe_idempotency_key:
      "charge:campaign:camp-1:commitment:commit-1:bag:1",
    payment_status: "awaiting_charge",
    attempt_count: 0,
    next_attempt_at: null,
    failed_reason: null,
    payment_update_email_sent_at: null,
    ...overrides,
  };
}

function defaultCommitment(overrides: Record<string, unknown> = {}) {
  return {
    stripe_payment_method_id: "pm_test_card",
    stripe_customer_id: "cus_test",
    charge_currency: "usd",
    payment_error: null,
    lot_id: "lot-1",
    buyer: { email: "buyer@example.com", contact_name: "Test Buyer" },
    lot: { title: "Test Lot" },
    ...overrides,
  };
}

function makeDeps(
  stripeImpl: ProcessBagChargeDeps["createAndConfirmPaymentIntent"]
): ProcessBagChargeDeps {
  return {
    createAndConfirmPaymentIntent: stripeImpl,
    now: () => FIXED_NOW,
  };
}

function findLastUpdate(table: string) {
  for (let i = captured.length - 1; i >= 0; i--) {
    if (captured[i].table === table) return captured[i];
  }
  return undefined;
}

function approxMs(iso: unknown, expectedMs: number, toleranceMs = 1000) {
  expect(typeof iso).toBe("string");
  const actual = new Date(iso as string).getTime();
  expect(Math.abs(actual - expectedMs)).toBeLessThanOrEqual(toleranceMs);
}

beforeEach(() => {
  captured.length = 0;
  fromQueue.length = 0;
  currentTable = null;
  mockSendPaymentUpdateRequiredEmail.mockReset();
  mockSendPaymentUpdateRequiredEmail.mockResolvedValue({ success: true });
});

// -------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------

describe("processBagCharge", () => {
  // ---------- 1. Happy path: first attempt succeeds ----------
  it("flips awaiting_charge → charged on Stripe success, stores payment_intent_id", async () => {
    // Lease UPDATE: returns the leased row.
    enqueue("commitment_bag_charges", {
      data: { id: "charge-1" },
      error: null,
    });
    // commitments SELECT.
    enqueue("commitments", { data: defaultCommitment(), error: null });
    // Final UPDATE → charged.
    enqueue("commitment_bag_charges", { data: null, error: null });

    const stripeMock = vi.fn().mockResolvedValue({
      id: "pi_succeeded_1",
      status: "succeeded",
    });

    const result = await processBagCharge(
      makeSupabase(),
      mkRow(),
      makeDeps(stripeMock)
    );

    expect(result.outcome).toBe("charged");
    expect(stripeMock).toHaveBeenCalledTimes(1);
    expect(stripeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 30000,
        currency: "usd",
        customerId: "cus_test",
        paymentMethodId: "pm_test_card",
        commitmentId: "commit-1",
        lotId: "lot-1",
        idempotencyKey:
          "charge:campaign:camp-1:commitment:commit-1:bag:1",
      })
    );

    // Lease UPDATE: status=charging, with a lease window in next_attempt_at.
    expect(captured[0]).toMatchObject({
      table: "commitment_bag_charges",
      payload: expect.objectContaining({ payment_status: "charging" }),
      inStatuses: ["awaiting_charge", "retry_scheduled", "charging"],
    });

    // Final UPDATE: status=charged, attempt_count=1, intent stored.
    const finalUpdate = captured[captured.length - 1];
    expect(finalUpdate.payload).toMatchObject({
      payment_status: "charged",
      stripe_payment_intent_id: "pi_succeeded_1",
      attempt_count: 1,
      failed_reason: null,
      next_attempt_at: null,
    });
  });

  // ---------- 2. First decline → retry_scheduled +12h ----------
  it("flips awaiting_charge → retry_scheduled +12h on first decline", async () => {
    enqueue("commitment_bag_charges", {
      data: { id: "charge-1" },
      error: null,
    });
    enqueue("commitments", { data: defaultCommitment(), error: null });
    enqueue("commitment_bag_charges", { data: null, error: null });

    const stripeMock = vi
      .fn()
      .mockRejectedValue(new Error("Your card was declined."));

    const result = await processBagCharge(
      makeSupabase(),
      mkRow({ attempt_count: 0, payment_status: "awaiting_charge" }),
      makeDeps(stripeMock)
    );

    expect(result.outcome).toBe("retry_scheduled");

    const finalUpdate = findLastUpdate("commitment_bag_charges");
    expect(finalUpdate?.payload).toMatchObject({
      payment_status: "retry_scheduled",
      attempt_count: 1,
      failed_reason: "Your card was declined.",
    });
    // 12h after FIXED_NOW.
    approxMs(
      finalUpdate?.payload.next_attempt_at,
      FIXED_NOW_MS + 12 * 60 * 60 * 1000
    );
  });

  // ---------- 3. Second decline (recover from retry_scheduled) → +48h ----------
  it("flips retry_scheduled(attempt=1) → retry_scheduled(attempt=2) +48h on second decline", async () => {
    enqueue("commitment_bag_charges", {
      data: { id: "charge-1" },
      error: null,
    });
    enqueue("commitments", { data: defaultCommitment(), error: null });
    enqueue("commitment_bag_charges", { data: null, error: null });

    const stripeMock = vi
      .fn()
      .mockRejectedValue(new Error("insufficient_funds"));

    const result = await processBagCharge(
      makeSupabase(),
      mkRow({
        attempt_count: 1,
        payment_status: "retry_scheduled",
        next_attempt_at: new Date(
          FIXED_NOW_MS - 1000
        ).toISOString(),
      }),
      makeDeps(stripeMock)
    );

    expect(result.outcome).toBe("retry_scheduled");

    const finalUpdate = findLastUpdate("commitment_bag_charges");
    expect(finalUpdate?.payload).toMatchObject({
      payment_status: "retry_scheduled",
      attempt_count: 2,
      failed_reason: "insufficient_funds",
    });
    // 48h after FIXED_NOW.
    approxMs(
      finalUpdate?.payload.next_attempt_at,
      FIXED_NOW_MS + 48 * 60 * 60 * 1000
    );
  });

  // ---------- 4. Third decline → terminal payment_failed ----------
  it("flips retry_scheduled(attempt=2) → payment_failed(attempt=3) on third decline", async () => {
    enqueue("commitment_bag_charges", {
      data: { id: "charge-1" },
      error: null,
    });
    enqueue("commitments", { data: defaultCommitment(), error: null });
    enqueue("commitment_bag_charges", { data: null, error: null });

    const stripeMock = vi.fn().mockRejectedValue(new Error("card_declined"));

    const result = await processBagCharge(
      makeSupabase(),
      mkRow({
        attempt_count: 2,
        payment_status: "retry_scheduled",
        next_attempt_at: new Date(FIXED_NOW_MS - 1000).toISOString(),
      }),
      makeDeps(stripeMock)
    );

    expect(result.outcome).toBe("payment_failed");

    const finalUpdate = findLastUpdate("commitment_bag_charges");
    expect(finalUpdate?.payload).toMatchObject({
      payment_status: "payment_failed",
      attempt_count: 3,
      failed_reason: "card_declined",
      next_attempt_at: null,
    });
  });

  // ---------- 5. Auth probe failed: skip Stripe, mark terminal ----------
  it("never calls Stripe and marks payment_failed when commitment.payment_error is set", async () => {
    enqueue("commitment_bag_charges", {
      data: { id: "charge-1" },
      error: null,
    });
    enqueue("commitments", {
      data: defaultCommitment({ payment_error: "card_auth_failed" }),
      error: null,
    });
    enqueue("commitment_bag_charges", { data: null, error: null });

    const stripeMock = vi.fn();

    const result = await processBagCharge(
      makeSupabase(),
      mkRow(),
      makeDeps(stripeMock)
    );

    expect(result.outcome).toBe("payment_failed");
    expect(stripeMock).not.toHaveBeenCalled();

    const finalUpdate = findLastUpdate("commitment_bag_charges");
    expect(finalUpdate?.payload).toMatchObject({
      payment_status: "payment_failed",
      failed_reason: "auth_probe_failed",
      next_attempt_at: null,
    });
  });

  // ---------- 6. Skipped (race): another worker already grabbed the row ----------
  it("returns skipped without calling Stripe when the lease UPDATE matches zero rows", async () => {
    // Lease UPDATE returns no row (another worker already flipped it).
    enqueue("commitment_bag_charges", { data: null, error: null });

    const stripeMock = vi.fn();

    const result = await processBagCharge(
      makeSupabase(),
      mkRow({ payment_status: "charging", attempt_count: 0 }),
      makeDeps(stripeMock)
    );

    expect(result.outcome).toBe("skipped");
    expect(result.reason).toBe("row_not_workable");
    expect(stripeMock).not.toHaveBeenCalled();
    // Only one UPDATE attempted — the lease. No commitments lookup.
    expect(captured.length).toBe(1);
  });

  // ---------- 7. Transient error: re-queue +1h, attempt_count UNCHANGED ----------
  it("re-queues +1h without incrementing attempt_count on transient Stripe error", async () => {
    enqueue("commitment_bag_charges", {
      data: { id: "charge-1" },
      error: null,
    });
    enqueue("commitments", { data: defaultCommitment(), error: null });
    enqueue("commitment_bag_charges", { data: null, error: null });

    // Transient error signature: Stripe message containing "api_connection_error".
    const stripeMock = vi
      .fn()
      .mockRejectedValue(new Error("api_connection_error: server hiccup"));

    const result = await processBagCharge(
      makeSupabase(),
      mkRow({ attempt_count: 0, payment_status: "awaiting_charge" }),
      makeDeps(stripeMock)
    );

    expect(result.outcome).toBe("retry_scheduled");

    const finalUpdate = findLastUpdate("commitment_bag_charges");
    expect(finalUpdate?.payload).toMatchObject({
      payment_status: "retry_scheduled",
    });
    // attempt_count must NOT be in the UPDATE payload — transient errors
    // are free retries.
    expect(finalUpdate?.payload).not.toHaveProperty("attempt_count");
    // 1h after FIXED_NOW.
    approxMs(
      finalUpdate?.payload.next_attempt_at,
      FIXED_NOW_MS + 60 * 60 * 1000
    );
  });

  // ---------- 8. AC13 payment-update email fires on 1→2 attempt transition ----------
  it("sends payment-update email and stamps payment_update_email_sent_at on the 1→2 attempt transition", async () => {
    enqueue("commitment_bag_charges", {
      data: { id: "charge-1" },
      error: null,
    });
    enqueue("commitments", { data: defaultCommitment(), error: null });
    enqueue("commitment_bag_charges", { data: null, error: null });

    const stripeMock = vi
      .fn()
      .mockRejectedValue(new Error("insufficient_funds"));

    const result = await processBagCharge(
      makeSupabase(),
      mkRow({
        attempt_count: 1,
        payment_status: "retry_scheduled",
        next_attempt_at: new Date(FIXED_NOW_MS - 1000).toISOString(),
        payment_update_email_sent_at: null,
      }),
      makeDeps(stripeMock)
    );

    expect(result.outcome).toBe("retry_scheduled");

    // Email called exactly once, with the buyer/lot from the commitment row
    // and the decline reason as Stripe returned it.
    expect(mockSendPaymentUpdateRequiredEmail).toHaveBeenCalledTimes(1);
    expect(mockSendPaymentUpdateRequiredEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        buyer: { email: "buyer@example.com", contact_name: "Test Buyer" },
        lotTitle: "Test Lot",
        commitmentId: "commit-1",
        reason: "insufficient_funds",
      })
    );

    // Stamp persisted in the same UPDATE that transitions to attempt_count=2.
    const finalUpdate = findLastUpdate("commitment_bag_charges");
    expect(finalUpdate?.payload).toMatchObject({
      payment_status: "retry_scheduled",
      attempt_count: 2,
    });
    expect(finalUpdate?.payload).toHaveProperty(
      "payment_update_email_sent_at"
    );
    expect(
      typeof finalUpdate?.payload.payment_update_email_sent_at
    ).toBe("string");
  });

  // ---------- 9. First decline does NOT fire the email ----------
  it("does NOT send payment-update email on the 0→1 first-decline transition", async () => {
    enqueue("commitment_bag_charges", {
      data: { id: "charge-1" },
      error: null,
    });
    enqueue("commitments", { data: defaultCommitment(), error: null });
    enqueue("commitment_bag_charges", { data: null, error: null });

    const stripeMock = vi
      .fn()
      .mockRejectedValue(new Error("Your card was declined."));

    const result = await processBagCharge(
      makeSupabase(),
      mkRow({ attempt_count: 0, payment_status: "awaiting_charge" }),
      makeDeps(stripeMock)
    );

    expect(result.outcome).toBe("retry_scheduled");
    expect(mockSendPaymentUpdateRequiredEmail).not.toHaveBeenCalled();

    // Stamp must NOT be set — the email gate hasn't fired.
    const finalUpdate = findLastUpdate("commitment_bag_charges");
    expect(finalUpdate?.payload).toMatchObject({ attempt_count: 1 });
    expect(finalUpdate?.payload).not.toHaveProperty(
      "payment_update_email_sent_at"
    );
  });

  // ---------- 10. Idempotency: stamp already set → no duplicate email ----------
  it("does NOT re-send payment-update email if payment_update_email_sent_at is already set", async () => {
    enqueue("commitment_bag_charges", {
      data: { id: "charge-1" },
      error: null,
    });
    enqueue("commitments", { data: defaultCommitment(), error: null });
    enqueue("commitment_bag_charges", { data: null, error: null });

    const stripeMock = vi
      .fn()
      .mockRejectedValue(new Error("insufficient_funds"));

    // Simulate a re-run: attempt_count still at 1 (the prior 1→2 UPDATE
    // failed mid-write, say) but the stamp is already on the row. We expect
    // the worker to land the same 1→2 transition without re-sending.
    const result = await processBagCharge(
      makeSupabase(),
      mkRow({
        attempt_count: 1,
        payment_status: "retry_scheduled",
        next_attempt_at: new Date(FIXED_NOW_MS - 1000).toISOString(),
        payment_update_email_sent_at: "2026-05-12T00:00:00.000Z",
      }),
      makeDeps(stripeMock)
    );

    expect(result.outcome).toBe("retry_scheduled");
    expect(mockSendPaymentUpdateRequiredEmail).not.toHaveBeenCalled();

    // Stamp should not be re-written in this UPDATE — the existing one stays.
    const finalUpdate = findLastUpdate("commitment_bag_charges");
    expect(finalUpdate?.payload).toMatchObject({ attempt_count: 2 });
    expect(finalUpdate?.payload).not.toHaveProperty(
      "payment_update_email_sent_at"
    );
  });
});

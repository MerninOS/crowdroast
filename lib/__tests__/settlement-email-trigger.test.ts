/**
 * Tests for `sendSettlementEmailIfReady` (lib/settlement-email-trigger.ts) — Task 4.13.
 *
 * Covers the four documented return paths:
 *   1. `'not_ready'`    — at least one sibling charge row is non-terminal
 *   2. `'already_sent'` — commitments.settlement_email_sent_at is non-NULL
 *   3. `'sent'` happy   — all sibling rows terminal, payload built + atomic stamp
 *   4. `'sent'` failure — zero rows exist (campaign-failed-under-min-bags)
 *
 * Strategy mirrors lib/__tests__/bag-transfer-out.test.ts: an in-memory
 * Supabase chain stub pre-staged with a queue of responses, and a `deps`
 * injection slot for the `sendCampaignSettledEmail` function so we can
 * assert the email payload without hitting Resend.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// `lib/email/transport.ts` throws at import time when RESEND_API_KEY is
// unset, so `lib/email/index.ts` cannot be loaded in a test environment.
// Mock the module surface the trigger imports so transport never loads.
// The trigger always honors the injected `deps.sendCampaignSettledEmail`
// when provided, so this mock is just to satisfy the module graph — the
// tests below pass their own mock via `makeDeps`.
vi.mock("@/lib/email", () => ({
  sendCampaignSettledEmail: vi.fn().mockResolvedValue({ success: true }),
}));

import {
  sendSettlementEmailIfReady,
  type SendSettlementEmailDeps,
} from "@/lib/settlement-email-trigger";

// -------------------------------------------------------------------------
// Supabase chain stub
// -------------------------------------------------------------------------
// One queue entry per `from(table)` call. Captures both UPDATE payloads (so
// the happy-path test can assert the atomic stamp) AND the chained
// `is()`/`eq()` filters (so we can assert the stamp UPDATE uses the
// `settlement_email_sent_at IS NULL` conditional).

type CapturedWrite = {
  table: string;
  payload?: Record<string, unknown>;
  isCol?: string;
  isVal?: unknown;
};
type SelectResponse = { data: unknown; error: unknown };

const captured: CapturedWrite[] = [];
const fromQueue: Array<() => Record<string, unknown>> = [];
let currentTable: string | null = null;

function makeChain(response: SelectResponse) {
  let pendingPayload: Record<string, unknown> | null = null;
  let pendingIsCol: string | undefined;
  let pendingIsVal: unknown;
  const tableNow = currentTable!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    is: vi.fn((col: string, val: unknown) => {
      pendingIsCol = col;
      pendingIsVal = val;
      return chain;
    }),
    update: vi.fn((p: Record<string, unknown>) => {
      pendingPayload = p;
      return chain;
    }),
    insert: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve(response)),
    single: vi.fn(() => {
      if (pendingPayload) {
        captured.push({
          table: tableNow,
          payload: pendingPayload,
          isCol: pendingIsCol,
          isVal: pendingIsVal,
        });
      }
      return Promise.resolve(response);
    }),
    then: (resolve: (v: unknown) => void) => {
      if (pendingPayload) {
        captured.push({
          table: tableNow,
          payload: pendingPayload,
          isCol: pendingIsCol,
          isVal: pendingIsVal,
        });
      }
      return Promise.resolve(response).then(resolve);
    },
  };
  // Bake capture into the terminator that the trigger actually uses for
  // the stamp UPDATE: `.select("id")` then await (no .single()). The chain
  // resolves the select-array via `then` above — pendingPayload is captured
  // at that point.
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
// Fixtures
// -------------------------------------------------------------------------

const FIXED_NOW = new Date("2026-05-13T12:00:00.000Z");

function defaultCommitmentJoin(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: "commit-1",
    settlement_email_sent_at: null,
    buyer: { email: "buyer@example.com", contact_name: "Test Buyer" },
    lot: { title: "Honduras Catuai", currency: "USD" },
    ...overrides,
  };
}

function makeDeps(
  sendImpl?: SendSettlementEmailDeps["sendCampaignSettledEmail"]
): SendSettlementEmailDeps {
  return {
    sendCampaignSettledEmail:
      sendImpl || vi.fn().mockResolvedValue({ success: true }),
    now: () => FIXED_NOW,
  };
}

beforeEach(() => {
  captured.length = 0;
  fromQueue.length = 0;
  currentTable = null;
});

// -------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------

describe("sendSettlementEmailIfReady", () => {
  // ----------------------------------------------------------------
  // 1. not_ready — at least one sibling row non-terminal
  // ----------------------------------------------------------------
  it("returns 'not_ready' when any sibling charge row is still in-flight", async () => {
    enqueue("commitments", {
      data: defaultCommitmentJoin(),
      error: null,
    });
    // bag-charge rows: one charged, one still awaiting → not ready.
    enqueue("commitment_bag_charges", {
      data: [
        { bag_number: 1, kg: 30, amount_cents: 30000, payment_status: "charged" },
        { bag_number: 2, kg: 30, amount_cents: 30000, payment_status: "awaiting_charge" },
      ],
      error: null,
    });

    const sendMock = vi.fn();
    const result = await sendSettlementEmailIfReady(
      makeSupabase(),
      "commit-1",
      makeDeps(sendMock)
    );

    expect(result.status).toBe("not_ready");
    expect(sendMock).not.toHaveBeenCalled();
    // No UPDATE was attempted — stamp must remain NULL so the next worker
    // tick can re-evaluate.
    expect(captured).toHaveLength(0);
  });

  // ----------------------------------------------------------------
  // 2. already_sent — the stamp is already set
  // ----------------------------------------------------------------
  it("returns 'already_sent' when commitments.settlement_email_sent_at is non-NULL", async () => {
    enqueue("commitments", {
      data: defaultCommitmentJoin({
        settlement_email_sent_at: "2026-05-12T00:00:00.000Z",
      }),
      error: null,
    });

    const sendMock = vi.fn();
    const result = await sendSettlementEmailIfReady(
      makeSupabase(),
      "commit-1",
      makeDeps(sendMock)
    );

    expect(result.status).toBe("already_sent");
    expect(sendMock).not.toHaveBeenCalled();
    // Short-circuits before any bag-charge lookup or stamp UPDATE.
    expect(captured).toHaveLength(0);
  });

  // ----------------------------------------------------------------
  // 3. sent — happy path, all rows charged
  // ----------------------------------------------------------------
  it("sends the per-bag summary email and atomically stamps when all rows are terminal", async () => {
    enqueue("commitments", {
      data: defaultCommitmentJoin(),
      error: null,
    });
    enqueue("commitment_bag_charges", {
      data: [
        { bag_number: 1, kg: 30, amount_cents: 33000, payment_status: "charged" },
        { bag_number: 2, kg: 30, amount_cents: 33000, payment_status: "charged" },
      ],
      error: null,
    });
    // Atomic stamp UPDATE → returns one row (we won the race).
    enqueue("commitments", { data: [{ id: "commit-1" }], error: null });
    // Outcome UPDATE (settlement_email_status = 'sent') — fire-and-await,
    // returns nothing meaningful.
    enqueue("commitments", { data: null, error: null });

    const sendMock = vi.fn().mockResolvedValue({ success: true });
    const result = await sendSettlementEmailIfReady(
      makeSupabase(),
      "commit-1",
      makeDeps(sendMock)
    );

    expect(result.status).toBe("sent");

    // Email payload assertions: per-bag rows + aggregate totals + currency
    // are all derived from the resolved charge rows.
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        buyer: { email: "buyer@example.com", contact_name: "Test Buyer" },
        lotTitle: "Honduras Catuai",
        currency: "USD",
        bagRows: [
          { bagNumber: 1, kg: 30, amountCents: 33000, status: "charged" },
          { bagNumber: 2, kg: 30, amountCents: 33000, status: "charged" },
        ],
        totals: {
          kgPurchased: 60,
          kgFailed: 0,
          totalChargedCents: 66000,
        },
        commitmentUrl: expect.stringContaining(
          "/dashboard/buyer/commitments/commit-1"
        ),
      })
    );

    // Atomic stamp: UPDATE on commitments with payload setting
    // settlement_email_sent_at, gated by `.is("settlement_email_sent_at", null)`.
    const commitmentUpdates = captured.filter((c) => c.table === "commitments");
    const stampUpdate = commitmentUpdates.find(
      (c) => c.payload && "settlement_email_sent_at" in c.payload
    );
    expect(stampUpdate).toBeDefined();
    expect(stampUpdate?.payload).toMatchObject({
      settlement_email_sent_at: FIXED_NOW.toISOString(),
    });
    expect(stampUpdate?.isCol).toBe("settlement_email_sent_at");
    expect(stampUpdate?.isVal).toBeNull();

    // Outcome stamp: settlement_email_status = 'sent' on success.
    const outcomeUpdate = commitmentUpdates.find(
      (c) => c.payload && "settlement_email_status" in c.payload
    );
    expect(outcomeUpdate).toBeDefined();
    expect(outcomeUpdate?.payload).toMatchObject({
      settlement_email_status: "sent",
    });
  });

  // ----------------------------------------------------------------
  // 4. sent — failure variant, zero bag-charge rows
  // ----------------------------------------------------------------
  it("sends the campaign-failure variant with empty bagRows when zero charge rows exist", async () => {
    enqueue("commitments", {
      data: defaultCommitmentJoin(),
      error: null,
    });
    // The campaign failed under min_bags_to_succeed → no rows were ever
    // inserted by settlement.
    enqueue("commitment_bag_charges", { data: [], error: null });
    enqueue("commitments", { data: [{ id: "commit-1" }], error: null });
    // Outcome UPDATE.
    enqueue("commitments", { data: null, error: null });

    const sendMock = vi.fn().mockResolvedValue({ success: true });
    const result = await sendSettlementEmailIfReady(
      makeSupabase(),
      "commit-1",
      makeDeps(sendMock)
    );

    expect(result.status).toBe("sent");

    // The template branches on bagRows.length === 0 — assert we pass
    // exactly that. Totals are all zero in the failure variant.
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        lotTitle: "Honduras Catuai",
        bagRows: [],
        totals: {
          kgPurchased: 0,
          kgFailed: 0,
          totalChargedCents: 0,
        },
      })
    );

    // Stamp still fires for idempotency — a retry of settle-deadlines on
    // the same failed campaign must not re-send.
    const stampUpdate = captured.find(
      (c) =>
        c.table === "commitments" &&
        c.payload &&
        "settlement_email_sent_at" in c.payload
    );
    expect(stampUpdate?.payload).toMatchObject({
      settlement_email_sent_at: FIXED_NOW.toISOString(),
    });
  });

  // ----------------------------------------------------------------
  // 5. already_sent — race lost on the atomic stamp UPDATE
  // ----------------------------------------------------------------
  it("returns 'already_sent' when the atomic stamp UPDATE matches zero rows (concurrent caller won)", async () => {
    enqueue("commitments", {
      data: defaultCommitmentJoin(),
      error: null,
    });
    enqueue("commitment_bag_charges", {
      data: [
        { bag_number: 1, kg: 30, amount_cents: 30000, payment_status: "charged" },
      ],
      error: null,
    });
    // Stamp UPDATE returns ZERO rows — another caller stamped first.
    enqueue("commitments", { data: [], error: null });

    const sendMock = vi.fn();
    const result = await sendSettlementEmailIfReady(
      makeSupabase(),
      "commit-1",
      makeDeps(sendMock)
    );

    expect(result.status).toBe("already_sent");
    // Critical: we MUST NOT call sendCampaignSettledEmail if we lost the
    // race — otherwise the buyer gets duplicate emails.
    expect(sendMock).not.toHaveBeenCalled();
  });

  // ----------------------------------------------------------------
  // 6. mixed terminal: charged + payment_failed rows both present
  // ----------------------------------------------------------------
  it("includes both 'charged' and 'payment_failed' rows with correct aggregate totals", async () => {
    enqueue("commitments", {
      data: defaultCommitmentJoin(),
      error: null,
    });
    enqueue("commitment_bag_charges", {
      data: [
        { bag_number: 1, kg: 30, amount_cents: 33000, payment_status: "charged" },
        { bag_number: 2, kg: 30, amount_cents: 33000, payment_status: "payment_failed" },
      ],
      error: null,
    });
    enqueue("commitments", { data: [{ id: "commit-1" }], error: null });
    // Outcome UPDATE.
    enqueue("commitments", { data: null, error: null });

    const sendMock = vi.fn().mockResolvedValue({ success: true });
    const result = await sendSettlementEmailIfReady(
      makeSupabase(),
      "commit-1",
      makeDeps(sendMock)
    );

    expect(result.status).toBe("sent");
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        bagRows: [
          { bagNumber: 1, kg: 30, amountCents: 33000, status: "charged" },
          {
            bagNumber: 2,
            kg: 30,
            amountCents: 33000,
            status: "payment_failed",
          },
        ],
        totals: {
          // Only the charged row contributes to kg purchased + total.
          kgPurchased: 30,
          kgFailed: 30,
          totalChargedCents: 33000,
        },
      })
    );
  });

  // ----------------------------------------------------------------
  // 7. M6 — Resend success stamps settlement_email_status = 'sent'
  // ----------------------------------------------------------------
  it("stamps settlement_email_status = 'sent' when Resend returns success", async () => {
    enqueue("commitments", {
      data: defaultCommitmentJoin(),
      error: null,
    });
    enqueue("commitment_bag_charges", {
      data: [
        { bag_number: 1, kg: 30, amount_cents: 33000, payment_status: "charged" },
      ],
      error: null,
    });
    // Atomic stamp UPDATE — we win the race.
    enqueue("commitments", { data: [{ id: "commit-1" }], error: null });
    // Outcome UPDATE — write status = 'sent'.
    enqueue("commitments", { data: null, error: null });

    const sendMock = vi.fn().mockResolvedValue({ success: true });
    const result = await sendSettlementEmailIfReady(
      makeSupabase(),
      "commit-1",
      makeDeps(sendMock)
    );

    expect(result.status).toBe("sent");
    expect(sendMock).toHaveBeenCalledTimes(1);

    // The outcome write is the LAST capture against the commitments
    // table — the stamp UPDATE went first.
    const outcomeUpdate = captured.find(
      (c) =>
        c.table === "commitments" &&
        c.payload &&
        "settlement_email_status" in c.payload
    );
    expect(outcomeUpdate).toBeDefined();
    expect(outcomeUpdate?.payload).toMatchObject({
      settlement_email_status: "sent",
    });
  });

  // ----------------------------------------------------------------
  // 8. M6 — Resend failure stamps settlement_email_status = 'send_failed'
  // ----------------------------------------------------------------
  it("stamps settlement_email_status = 'send_failed' when Resend throws", async () => {
    enqueue("commitments", {
      data: defaultCommitmentJoin(),
      error: null,
    });
    enqueue("commitment_bag_charges", {
      data: [
        { bag_number: 1, kg: 30, amount_cents: 33000, payment_status: "charged" },
      ],
      error: null,
    });
    enqueue("commitments", { data: [{ id: "commit-1" }], error: null });
    // Outcome UPDATE — write status = 'send_failed'.
    enqueue("commitments", { data: null, error: null });

    // Resend exception — the trigger catches it but still stamps outcome.
    const sendMock = vi.fn().mockRejectedValue(new Error("Resend 503"));
    const result = await sendSettlementEmailIfReady(
      makeSupabase(),
      "commit-1",
      makeDeps(sendMock)
    );

    expect(result.status).toBe("skipped");
    expect(result.reason).toContain("send_threw_after_stamp");
    expect(result.reason).toContain("Resend 503");

    const outcomeUpdate = captured.find(
      (c) =>
        c.table === "commitments" &&
        c.payload &&
        "settlement_email_status" in c.payload
    );
    expect(outcomeUpdate).toBeDefined();
    expect(outcomeUpdate?.payload).toMatchObject({
      settlement_email_status: "send_failed",
    });

    // The stamp on settlement_email_sent_at is still present — we do
    // NOT roll it back. The sweeper is responsible for clearing both
    // columns and re-invoking the trigger.
    const stampUpdate = captured.find(
      (c) =>
        c.table === "commitments" &&
        c.payload &&
        "settlement_email_sent_at" in c.payload
    );
    expect(stampUpdate?.payload).toMatchObject({
      settlement_email_sent_at: FIXED_NOW.toISOString(),
    });
  });

  // ----------------------------------------------------------------
  // 9. M6 — Resend non-2xx (success=false) stamps 'send_failed'
  // ----------------------------------------------------------------
  it("stamps settlement_email_status = 'send_failed' when Resend returns success=false", async () => {
    enqueue("commitments", {
      data: defaultCommitmentJoin(),
      error: null,
    });
    enqueue("commitment_bag_charges", {
      data: [
        { bag_number: 1, kg: 30, amount_cents: 33000, payment_status: "charged" },
      ],
      error: null,
    });
    enqueue("commitments", { data: [{ id: "commit-1" }], error: null });
    enqueue("commitments", { data: null, error: null });

    const sendMock = vi
      .fn()
      .mockResolvedValue({ success: false, error: "rate_limited" });
    const result = await sendSettlementEmailIfReady(
      makeSupabase(),
      "commit-1",
      makeDeps(sendMock)
    );

    expect(result.status).toBe("skipped");
    expect(result.reason).toContain("send_failed_after_stamp");
    expect(result.reason).toContain("rate_limited");

    const outcomeUpdate = captured.find(
      (c) =>
        c.table === "commitments" &&
        c.payload &&
        "settlement_email_status" in c.payload
    );
    expect(outcomeUpdate?.payload).toMatchObject({
      settlement_email_status: "send_failed",
    });
  });
});

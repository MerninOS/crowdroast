// Route-level tests for /api/admin/failed-payments POST.
//
// Covers the two findings from the bag-aware-campaign-close code review:
//   • M2 — when the optimistic concurrency UPDATE matches zero rows (another
//     admin already moved the row), the handler must 409 AND must NOT write
//     the ops_actions audit row.
//   • B4 — `mark_covered_by_platform` and `mark_covered_by_hub` must trigger
//     the same downstream hooks the charge worker uses on terminal exits
//     (transferOutBagIfReady + sendSettlementEmailIfReady). The other two
//     actions (`retry_charge`, `cancel_bag_portion`) must NOT trigger them.
//
// The admin Supabase client is mocked at table+method granularity rather
// than via a high-level "admin client" stub — the handler reaches into both
// `commitment_bag_charges` (read + update) and `ops_actions` (insert), and
// each call shape matters for the assertions.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// -------------------------------------------------------------------------
// Hoisted mock state
// -------------------------------------------------------------------------

interface RowLookupResult {
  data: {
    id: string;
    commitment_id: string;
    bag_number: number;
    payment_status: string;
    amount_cents: number;
    attempt_count: number;
  } | null;
  error: { message: string } | null;
}

interface UpdateResult {
  data: { id: string; payment_status: string } | null;
  error: { message: string } | null;
}

let nextRowLookup: RowLookupResult = { data: null, error: null };
let nextUpdateResult: UpdateResult = { data: null, error: null };
let nextAuditResult: { id: string } | { error: string } = { id: "audit-1" };

let updateCalls: Array<Record<string, unknown>> = [];
let auditCalls: Array<Record<string, unknown>> = [];

// vi.mock factories are hoisted above all top-level `const`s, so any
// dependencies the factories close over must live in `vi.hoisted(...)`.
const hoisted = vi.hoisted(() => {
  return {
    mockTransferOutBagIfReady: vi.fn(),
    mockSendSettlementEmailIfReady: vi.fn(),
    mockRecordOpsAction: vi.fn(),
  };
});
const mockTransferOutBagIfReady = hoisted.mockTransferOutBagIfReady;
const mockSendSettlementEmailIfReady = hoisted.mockSendSettlementEmailIfReady;
const mockRecordOpsAction = hoisted.mockRecordOpsAction;

vi.mock("@/lib/bag-transfer-out", () => ({
  transferOutBagIfReady: hoisted.mockTransferOutBagIfReady,
}));
vi.mock("@/lib/settlement-email-trigger", () => ({
  sendSettlementEmailIfReady: hoisted.mockSendSettlementEmailIfReady,
}));

vi.mock("@/lib/admin/ops-actions", () => ({
  recordOpsAction: hoisted.mockRecordOpsAction,
}));

let mockCtx:
  | { user: { id: string }; admin: unknown }
  | { error: NextResponse } = { error: NextResponse.json({ error: "no" }, { status: 401 }) };

vi.mock("@/lib/auth/admin-route", () => ({
  requireAdminContext: vi.fn(async () => mockCtx),
}));

// -------------------------------------------------------------------------
// Admin client mock — only the tables the POST handler touches.
// -------------------------------------------------------------------------

function adminClient() {
  return {
    from: vi.fn((table: string) => {
      if (table === "commitment_bag_charges") {
        return {
          // Pre-flight row load: ctx.admin.from(...).select(...).eq("id", ...).maybeSingle()
          select: () => ({
            eq: () => ({
              maybeSingle: async () => nextRowLookup,
            }),
          }),
          // Optimistic UPDATE: .update(patch).eq("id", x).eq("payment_status", "payment_failed").select(...).maybeSingle()
          update: (patch: Record<string, unknown>) => {
            updateCalls.push(patch);
            return {
              eq: () => ({
                eq: () => ({
                  select: () => ({
                    maybeSingle: async () => nextUpdateResult,
                  }),
                }),
              }),
            };
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

import { POST } from "../route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/failed-payments", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  nextRowLookup = {
    data: {
      id: "charge-1",
      commitment_id: "commit-1",
      bag_number: 2,
      payment_status: "payment_failed",
      amount_cents: 27000,
      attempt_count: 3,
    },
    error: null,
  };
  nextUpdateResult = {
    data: { id: "charge-1", payment_status: "charged" },
    error: null,
  };
  nextAuditResult = { id: "audit-1" };
  updateCalls = [];
  auditCalls = [];
  mockTransferOutBagIfReady.mockClear();
  mockSendSettlementEmailIfReady.mockClear();
  mockRecordOpsAction.mockClear();
  mockTransferOutBagIfReady.mockResolvedValue({ status: "transferred" });
  mockSendSettlementEmailIfReady.mockResolvedValue({ status: "sent" });
  mockRecordOpsAction.mockImplementation(
    async (_admin: unknown, input: Record<string, unknown>) => {
      auditCalls.push(input);
      return nextAuditResult;
    }
  );
  mockCtx = { user: { id: "admin-1" }, admin: adminClient() };
});

// -------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------

describe("POST /api/admin/failed-payments — M2 concurrency", () => {
  it("returns 409 when the optimistic UPDATE matches zero rows", async () => {
    // Pre-flight read sees the row in payment_failed (so the early 409 at the
    // pre-flight gate does NOT fire), but the UPDATE returns data: null —
    // simulating another admin having moved the row between read + write.
    nextUpdateResult = { data: null, error: null };

    const res = await POST(
      makeRequest({ charge_id: "charge-1", action: "mark_covered_by_platform" })
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already moved by another admin|no longer in payment_failed/i);
  });

  it("does NOT write the audit row when UPDATE matches zero rows", async () => {
    nextUpdateResult = { data: null, error: null };

    await POST(
      makeRequest({ charge_id: "charge-1", action: "mark_covered_by_platform" })
    );

    // The whole point of M2: the audit log must reflect actions that actually
    // landed, not just attempts.
    expect(auditCalls).toHaveLength(0);
  });

  it("does NOT trigger downstream hooks when UPDATE matches zero rows", async () => {
    nextUpdateResult = { data: null, error: null };

    await POST(
      makeRequest({ charge_id: "charge-1", action: "mark_covered_by_platform" })
    );

    expect(mockTransferOutBagIfReady).not.toHaveBeenCalled();
    expect(mockSendSettlementEmailIfReady).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/failed-payments — B4 downstream hooks", () => {
  it("mark_covered_by_platform invokes transferOutBagIfReady + sendSettlementEmailIfReady", async () => {
    const res = await POST(
      makeRequest({ charge_id: "charge-1", action: "mark_covered_by_platform" })
    );

    expect(res.status).toBe(200);
    expect(mockTransferOutBagIfReady).toHaveBeenCalledTimes(1);
    // Hook receives (supabase, { commitmentId, bagNumber }) — the bag_number
    // must come off the row, not the request body.
    expect(mockTransferOutBagIfReady).toHaveBeenCalledWith(expect.anything(), {
      commitmentId: "commit-1",
      bagNumber: 2,
    });
    expect(mockSendSettlementEmailIfReady).toHaveBeenCalledTimes(1);
    expect(mockSendSettlementEmailIfReady).toHaveBeenCalledWith(
      expect.anything(),
      "commit-1"
    );
  });

  it("mark_covered_by_hub invokes both downstream hooks", async () => {
    const res = await POST(
      makeRequest({ charge_id: "charge-1", action: "mark_covered_by_hub" })
    );

    expect(res.status).toBe(200);
    expect(mockTransferOutBagIfReady).toHaveBeenCalledTimes(1);
    expect(mockSendSettlementEmailIfReady).toHaveBeenCalledTimes(1);
  });

  it("retry_charge does NOT invoke the downstream hooks (worker owns terminal transitions)", async () => {
    nextUpdateResult = {
      data: { id: "charge-1", payment_status: "awaiting_charge" },
      error: null,
    };

    const res = await POST(
      makeRequest({ charge_id: "charge-1", action: "retry_charge" })
    );

    expect(res.status).toBe(200);
    expect(mockTransferOutBagIfReady).not.toHaveBeenCalled();
    expect(mockSendSettlementEmailIfReady).not.toHaveBeenCalled();
  });

  it("cancel_bag_portion does NOT invoke the downstream hooks (no money to move)", async () => {
    // cancel_bag_portion only writes the audit row — there's no state change
    // on commitment_bag_charges (the row stays payment_failed by design).
    const res = await POST(
      makeRequest({
        charge_id: "charge-1",
        action: "cancel_bag_portion",
        notes: "Buyer unreachable",
      })
    );

    expect(res.status).toBe(200);
    expect(mockTransferOutBagIfReady).not.toHaveBeenCalled();
    expect(mockSendSettlementEmailIfReady).not.toHaveBeenCalled();
    // The audit row IS written for cancel_bag_portion — it's the canonical
    // record of the cancellation per the option-(b) decision.
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]).toMatchObject({ actionKind: "cancel_bag_portion" });
  });

  it("downstream hook failure does not block the 200 OK response (fire-and-forget)", async () => {
    // A Stripe outage or DB hiccup in the hook layer must not flip the
    // already-succeeded ops action to a 5xx. The audit row landed; the bag
    // money will eventually move on a subsequent worker tick.
    mockTransferOutBagIfReady.mockRejectedValueOnce(new Error("stripe down"));
    mockSendSettlementEmailIfReady.mockRejectedValueOnce(new Error("resend down"));

    const res = await POST(
      makeRequest({ charge_id: "charge-1", action: "mark_covered_by_platform" })
    );

    expect(res.status).toBe(200);
    expect(auditCalls).toHaveLength(1);
  });
});

describe("POST /api/admin/failed-payments — pre-flight gates", () => {
  it("404 when the row is not found", async () => {
    nextRowLookup = { data: null, error: null };
    const res = await POST(
      makeRequest({ charge_id: "ghost", action: "mark_covered_by_platform" })
    );
    expect(res.status).toBe(404);
  });

  it("409 at pre-flight when the row is not in payment_failed (separate gate from M2)", async () => {
    nextRowLookup = {
      data: {
        id: "charge-1",
        commitment_id: "commit-1",
        bag_number: 2,
        payment_status: "charged",
        amount_cents: 27000,
        attempt_count: 3,
      },
      error: null,
    };
    const res = await POST(
      makeRequest({ charge_id: "charge-1", action: "mark_covered_by_platform" })
    );
    expect(res.status).toBe(409);
    // No UPDATE was attempted, so neither audit nor hooks fired.
    expect(updateCalls).toHaveLength(0);
    expect(auditCalls).toHaveLength(0);
    expect(mockTransferOutBagIfReady).not.toHaveBeenCalled();
  });

  it("400 when action is unknown", async () => {
    const res = await POST(
      makeRequest({ charge_id: "charge-1", action: "nuke_from_orbit" })
    );
    expect(res.status).toBe(400);
  });

  it("403 when caller is not admin (delegated to requireAdminContext)", async () => {
    mockCtx = { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    const res = await POST(
      makeRequest({ charge_id: "charge-1", action: "mark_covered_by_platform" })
    );
    expect(res.status).toBe(403);
  });
});

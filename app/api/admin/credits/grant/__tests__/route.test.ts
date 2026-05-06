import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

type Result = { data: unknown; error: unknown };

let nextProfileLookup: Result = { data: null, error: null };
let nextInsertResult: Result = { data: null, error: null };
let nextLedgerSum: Result = { data: [], error: null };
const insertCalls: Array<Record<string, unknown>> = [];

let mockCtx:
  | { user: { id: string }; admin: unknown }
  | { error: NextResponse } = { error: NextResponse.json({ error: "no" }, { status: 401 }) };

vi.mock("@/lib/auth/admin-route", () => ({
  requireAdminContext: vi.fn(async () => mockCtx),
}));

function adminClient() {
  return {
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => nextProfileLookup,
            }),
          }),
        };
      }
      if (table === "credit_ledger") {
        return {
          insert: (payload: Record<string, unknown>) => {
            insertCalls.push(payload);
            return {
              select: () => ({
                single: async () => nextInsertResult,
              }),
            };
          },
          select: () => ({
            eq: () => Promise.resolve(nextLedgerSum),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

import { POST } from "../route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/credits/grant", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  nextProfileLookup = { data: null, error: null };
  nextInsertResult = { data: null, error: null };
  nextLedgerSum = { data: [], error: null };
  insertCalls.length = 0;
  mockCtx = { user: { id: "admin-1" }, admin: adminClient() };
});

describe("POST /api/admin/credits/grant", () => {
  it("403 when caller is not admin (delegated to requireAdminContext)", async () => {
    mockCtx = { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    const res = await POST(makeRequest({ user_id: "u-1", amount_cents: 1000 }));
    expect(res.status).toBe(403);
  });

  it("400 when user_id missing", async () => {
    const res = await POST(makeRequest({ amount_cents: 1000 }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("user_id_required");
  });

  it("400 when amount is zero", async () => {
    const res = await POST(makeRequest({ user_id: "u-1", amount_cents: 0 }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("amount_cents_must_be_nonzero_integer");
  });

  it("400 when amount is non-integer", async () => {
    const res = await POST(makeRequest({ user_id: "u-1", amount_cents: 12.5 }));
    expect(res.status).toBe(400);
  });

  it("404 when target user does not exist", async () => {
    nextProfileLookup = { data: null, error: null };
    const res = await POST(makeRequest({ user_id: "ghost", amount_cents: 1000 }));
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.error).toBe("user_not_found");
  });

  it("happy positive grant: inserts admin_adjust row stamped with granting admin", async () => {
    nextProfileLookup = { data: { id: "u-1" }, error: null };
    nextInsertResult = {
      data: {
        id: "ledger-1",
        amount_cents: 5000,
        reason: "admin_adjust",
        granted_by_admin_id: "admin-1",
        note: "make-good",
        created_at: "2026-05-06",
      },
      error: null,
    };
    nextLedgerSum = { data: [{ amount_cents: 5000 }], error: null };

    const res = await POST(
      makeRequest({ user_id: "u-1", amount_cents: 5000, note: "make-good" })
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.balance_cents).toBe(5000);
    expect(body.ledger_row.reason).toBe("admin_adjust");
    expect(body.ledger_row.granted_by_admin_id).toBe("admin-1");

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toMatchObject({
      user_id: "u-1",
      amount_cents: 5000,
      reason: "admin_adjust",
      granted_by_admin_id: "admin-1",
      note: "make-good",
    });
  });

  it("happy negative grant: admin can deduct", async () => {
    nextProfileLookup = { data: { id: "u-1" }, error: null };
    nextInsertResult = {
      data: {
        id: "ledger-2",
        amount_cents: -1500,
        reason: "admin_adjust",
        granted_by_admin_id: "admin-1",
        note: null,
        created_at: "2026-05-06",
      },
      error: null,
    };
    nextLedgerSum = {
      data: [{ amount_cents: 5000 }, { amount_cents: -1500 }],
      error: null,
    };

    const res = await POST(makeRequest({ user_id: "u-1", amount_cents: -1500 }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.balance_cents).toBe(3500);
    expect(insertCalls[0].amount_cents).toBe(-1500);
  });
});

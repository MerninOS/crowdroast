import { describe, it, expect, vi, beforeEach } from "vitest";

type Result = { data: unknown; error: unknown };

let currentUser: { id: string } | null = null;
let nextResult: Result = { data: [], error: null };

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: currentUser } })) },
    from: vi.fn(() => ({
      select: () => ({
        order: () => Promise.resolve(nextResult),
      }),
    })),
  })),
}));

import { GET } from "../route";

beforeEach(() => {
  currentUser = null;
  nextResult = { data: [], error: null };
});

describe("GET /api/credits/me", () => {
  it("401 unauthenticated", async () => {
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("balance 0 and empty ledger for fresh user", async () => {
    currentUser = { id: "buyer-1" };
    nextResult = { data: [], error: null };
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ balance_cents: 0, ledger: [] });
  });

  it("computes balance as sum of amount_cents and returns ledger rows", async () => {
    currentUser = { id: "buyer-1" };
    nextResult = {
      data: [
        {
          id: "l-3",
          amount_cents: -800,
          reason: "commit_applied",
          source_attribution_id: null,
          source_commitment_id: "commit-1",
          granted_by_admin_id: null,
          note: null,
          created_at: "2026-05-01",
        },
        {
          id: "l-2",
          amount_cents: 1000,
          reason: "referral_earned",
          source_attribution_id: "attr-2",
          source_commitment_id: null,
          granted_by_admin_id: null,
          note: null,
          created_at: "2026-04-15",
        },
        {
          id: "l-1",
          amount_cents: 1000,
          reason: "referral_earned",
          source_attribution_id: "attr-1",
          source_commitment_id: null,
          granted_by_admin_id: null,
          note: null,
          created_at: "2026-04-01",
        },
      ],
      error: null,
    };

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    // 1000 + 1000 - 800 = 1200
    expect(body.balance_cents).toBe(1200);
    expect(body.ledger).toHaveLength(3);
    expect(body.ledger[0].id).toBe("l-3"); // newest first preserved
  });

  it("balance handles admin_adjust with positive and negative amounts", async () => {
    currentUser = { id: "buyer-1" };
    nextResult = {
      data: [
        {
          id: "l-1",
          amount_cents: 5000,
          reason: "admin_adjust",
          source_attribution_id: null,
          source_commitment_id: null,
          granted_by_admin_id: "admin-1",
          note: "make-good for late lot",
          created_at: "2026-05-01",
        },
        {
          id: "l-2",
          amount_cents: -2000,
          reason: "admin_adjust",
          source_attribution_id: null,
          source_commitment_id: null,
          granted_by_admin_id: "admin-1",
          note: "correction",
          created_at: "2026-05-02",
        },
      ],
      error: null,
    };
    const res = await GET();
    const body = await res.json();
    expect(body.balance_cents).toBe(3000);
  });

  it("500 on db error", async () => {
    currentUser = { id: "buyer-1" };
    nextResult = { data: null, error: { message: "boom" } };
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

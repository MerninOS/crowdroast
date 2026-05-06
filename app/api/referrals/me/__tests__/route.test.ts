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

describe("GET /api/referrals/me", () => {
  it("401 unauthenticated", async () => {
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns empty groups for a buyer with no referrals", async () => {
    currentUser = { id: "buyer-1" };
    nextResult = { data: [], error: null };
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ pending: [], earned: [], voided: [] });
  });

  it("groups attributions by status", async () => {
    currentUser = { id: "buyer-1" };
    nextResult = {
      data: [
        {
          id: "a-1",
          status: "pending",
          earned_at: null,
          created_at: "2026-04-01",
          invitee: { contact_name: "Alice", company_name: "Alice Roasters" },
        },
        {
          id: "a-2",
          status: "earned",
          earned_at: "2026-04-15",
          created_at: "2026-04-10",
          invitee: { contact_name: "Bob", company_name: null },
        },
        {
          id: "a-3",
          status: "voided",
          earned_at: null,
          created_at: "2026-04-20",
          invitee: { contact_name: "Carol", company_name: null },
        },
        {
          id: "a-4",
          status: "earned",
          earned_at: "2026-05-01",
          created_at: "2026-04-25",
          invitee: { contact_name: "Dave", company_name: null },
        },
      ],
      error: null,
    };

    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.pending).toHaveLength(1);
    expect(body.earned).toHaveLength(2);
    expect(body.voided).toHaveLength(1);
    expect(body.earned.map((r: { id: string }) => r.id)).toEqual(["a-2", "a-4"]);
  });

  it("500 on db error", async () => {
    currentUser = { id: "buyer-1" };
    nextResult = { data: null, error: { message: "boom" } };
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

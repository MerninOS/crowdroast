import { describe, it, expect, vi, beforeEach } from "vitest";

type Result = { data: unknown; error: unknown };

let currentUser: { id: string } | null = null;
let attributionsResult: Result = { data: [], error: null };
let invitedProfilesResult: Result = { data: [], error: null };

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: currentUser } })) },
    from: vi.fn(() => ({
      select: () => ({
        order: () => Promise.resolve(attributionsResult),
      }),
    })),
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: () => ({
        eq: () => Promise.resolve(invitedProfilesResult),
      }),
    })),
  })),
}));

import { GET } from "../route";

beforeEach(() => {
  currentUser = null;
  attributionsResult = { data: [], error: null };
  invitedProfilesResult = { data: [], error: null };
});

describe("GET /api/referrals/me", () => {
  it("401 unauthenticated", async () => {
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns empty groups for a buyer with no invitees of any kind", async () => {
    currentUser = { id: "buyer-1" };
    attributionsResult = { data: [], error: null };
    invitedProfilesResult = { data: [], error: null };
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ joined: [], pending: [], earned: [], voided: [] });
  });

  it("includes signup-only invitees in the joined group when no attribution exists", async () => {
    currentUser = { id: "buyer-1" };
    attributionsResult = { data: [], error: null };
    invitedProfilesResult = {
      data: [
        {
          id: "invitee-1",
          contact_name: "Alice",
          company_name: "Alice Roasters",
          created_at: "2026-04-01",
        },
      ],
      error: null,
    };

    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.joined).toHaveLength(1);
    expect(body.joined[0]).toMatchObject({
      id: "invitee-1",
      status: "joined",
      invitee: { contact_name: "Alice", company_name: "Alice Roasters" },
    });
    expect(body.pending).toHaveLength(0);
  });

  it("dedupes: an invitee with an attribution row does NOT also show in joined", async () => {
    currentUser = { id: "buyer-1" };
    attributionsResult = {
      data: [
        {
          id: "attr-1",
          status: "pending",
          earned_at: null,
          created_at: "2026-04-15",
          invitee_user_id: "invitee-1",
          invitee: { contact_name: "Alice", company_name: null },
        },
      ],
      error: null,
    };
    invitedProfilesResult = {
      data: [
        // Same invitee — should NOT appear in joined since they have an attribution.
        {
          id: "invitee-1",
          contact_name: "Alice",
          company_name: null,
          created_at: "2026-04-01",
        },
        // A different invitee with no attribution yet.
        {
          id: "invitee-2",
          contact_name: "Bob",
          company_name: null,
          created_at: "2026-04-20",
        },
      ],
      error: null,
    };

    const res = await GET();
    const body = await res.json();

    expect(body.pending).toHaveLength(1);
    expect(body.pending[0].invitee.contact_name).toBe("Alice");
    expect(body.joined).toHaveLength(1);
    expect(body.joined[0].invitee.contact_name).toBe("Bob");
  });

  it("groups attribution rows by status (pending / earned / voided)", async () => {
    currentUser = { id: "buyer-1" };
    attributionsResult = {
      data: [
        {
          id: "a-1",
          status: "pending",
          earned_at: null,
          created_at: "2026-04-01",
          invitee_user_id: "i-1",
          invitee: { contact_name: "Alice", company_name: null },
        },
        {
          id: "a-2",
          status: "earned",
          earned_at: "2026-04-15",
          created_at: "2026-04-10",
          invitee_user_id: "i-2",
          invitee: { contact_name: "Bob", company_name: null },
        },
        {
          id: "a-3",
          status: "voided",
          earned_at: null,
          created_at: "2026-04-20",
          invitee_user_id: "i-3",
          invitee: { contact_name: "Carol", company_name: null },
        },
      ],
      error: null,
    };
    invitedProfilesResult = { data: [], error: null };

    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.pending).toHaveLength(1);
    expect(body.earned).toHaveLength(1);
    expect(body.voided).toHaveLength(1);
    expect(body.joined).toHaveLength(0);
  });

  it("500 on attributions query error", async () => {
    currentUser = { id: "buyer-1" };
    attributionsResult = { data: null, error: { message: "boom" } };
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

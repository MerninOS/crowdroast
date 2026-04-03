/**
 * Tests for POST /api/hub-members/leave — buyer leaves hub.
 *
 * Covers:
 * - Auth guard
 * - Leave succeeds with no open commitments
 * - Leave blocked by commitments on lots with future deadlines
 * - Leave allowed when commitments are on lots with past deadlines
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase server client
const mockSupabaseAuth = {
  getUser: vi.fn(),
};
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: () => mockSupabaseAuth.getUser() },
  }),
}));

// Mock admin client
const mockAdminFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn().mockReturnValue({
    from: (...args: unknown[]) => mockAdminFrom(...args),
  }),
}));

import { POST } from "@/app/api/hub-members/leave/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChain(response: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(response),
    maybeSingle: vi.fn().mockResolvedValue(response),
    then: (
      resolve: (v: { data: unknown; error: unknown }) => void,
      reject?: (e: unknown) => void
    ) => Promise.resolve(response).then(resolve, reject),
  };
  (["select", "eq", "neq", "in", "order", "limit", "update"] as const).forEach(
    (method) => {
      (chain[method] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    }
  );
  return chain;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabaseAuth.getUser.mockResolvedValue({
    data: { user: { id: "buyer-uuid-1" } },
  });
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

describe("POST /api/hub-members/leave — auth", () => {
  it("returns 401 when not authenticated", async () => {
    mockSupabaseAuth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST();
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// No membership
// ---------------------------------------------------------------------------

describe("POST /api/hub-members/leave — no membership", () => {
  it("returns 404 when buyer is not a member of any hub", async () => {
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "hub_members") {
        return makeChain({ data: null, error: null });
      }
      return makeChain({ data: null, error: null });
    });

    const res = await POST();
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Happy path — no open commitments
// ---------------------------------------------------------------------------

describe("POST /api/hub-members/leave — happy path", () => {
  it("removes membership when there are no open commitments", async () => {
    let updateCalled = false;

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "hub_members") {
        const chain = makeChain({
          data: { id: "member-uuid-1", hub_id: "hub-uuid-1" },
          error: null,
        });
        (chain.update as ReturnType<typeof vi.fn>).mockImplementation(() => {
          updateCalled = true;
          return makeChain({ data: null, error: null });
        });
        return chain;
      }
      if (table === "commitments") {
        return makeChain({ data: [], error: null }); // no commitments
      }
      return makeChain({ data: null, error: null });
    });

    const res = await POST();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.message).toMatch(/left/i);
    expect(updateCalled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Blocked — open commitments on lots with future deadlines
// ---------------------------------------------------------------------------

describe("POST /api/hub-members/leave — blocked by commitments", () => {
  it("returns 409 with blocking lot names when commitments exist on lots with future deadlines", async () => {
    const futureDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "hub_members") {
        return makeChain({
          data: { id: "member-uuid-1", hub_id: "hub-uuid-1" },
          error: null,
        });
      }
      if (table === "commitments") {
        return makeChain({
          data: [
            {
              id: "comm-uuid-1",
              lot: { id: "lot-uuid-1", title: "Ethiopia Natural", commitment_deadline: futureDeadline },
            },
          ],
          error: null,
        });
      }
      return makeChain({ data: null, error: null });
    });

    const res = await POST();
    expect(res.status).toBe(409);

    const body = await res.json();
    expect(body.error).toMatch(/open commitments/i);
    expect(body.blocking_lots).toContain("Ethiopia Natural");
  });
});

// ---------------------------------------------------------------------------
// Allowed — commitments on lots with past deadlines
// ---------------------------------------------------------------------------

describe("POST /api/hub-members/leave — past deadline commitments", () => {
  it("allows leave when commitments are only on lots with past deadlines", async () => {
    const pastDeadline = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "hub_members") {
        const chain = makeChain({
          data: { id: "member-uuid-1", hub_id: "hub-uuid-1" },
          error: null,
        });
        (chain.update as ReturnType<typeof vi.fn>).mockReturnValue(
          makeChain({ data: null, error: null })
        );
        return chain;
      }
      if (table === "commitments") {
        return makeChain({
          data: [
            {
              id: "comm-uuid-1",
              lot: { id: "lot-uuid-1", title: "Old Lot", commitment_deadline: pastDeadline },
            },
          ],
          error: null,
        });
      }
      return makeChain({ data: null, error: null });
    });

    const res = await POST();
    expect(res.status).toBe(200);
  });
});

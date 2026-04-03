/**
 * Tests for hub access request API routes.
 *
 * POST /api/hub-access-requests — buyer creates a pending request
 * GET /api/hub-access-requests — buyer reads own requests
 *
 * Mocks Supabase (both user client and admin client) and email functions.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase server client
const mockSupabaseFrom = vi.fn();
const mockSupabaseAuth = {
  getUser: vi.fn(),
};
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: () => mockSupabaseAuth.getUser() },
    from: (...args: unknown[]) => mockSupabaseFrom(...args),
  }),
}));

// Mock admin client
const mockAdminFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn().mockReturnValue({
    from: (...args: unknown[]) => mockAdminFrom(...args),
  }),
}));

// Mock email
vi.mock("@/lib/email", () => ({
  sendHubAccessRequestEmail: vi.fn().mockResolvedValue({ success: true }),
}));

import { POST, GET } from "@/app/api/hub-access-requests/route";
import { sendHubAccessRequestEmail } from "@/lib/email";

const mockSendEmail = vi.mocked(sendHubAccessRequestEmail);

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
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(response),
    maybeSingle: vi.fn().mockResolvedValue(response),
    then: (
      resolve: (v: { data: unknown; error: unknown }) => void,
      reject?: (e: unknown) => void
    ) => Promise.resolve(response).then(resolve, reject),
  };
  (["select", "eq", "neq", "in", "order", "limit", "insert", "update"] as const).forEach(
    (method) => {
      (chain[method] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    }
  );
  return chain;
}

function makeRequest(body?: Record<string, unknown>): Request {
  return new Request("http://localhost/api/hub-access-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabaseAuth.getUser.mockResolvedValue({
    data: { user: { id: "buyer-uuid-1", email: "buyer@roastery.com" } },
  });
});

// ---------------------------------------------------------------------------
// POST — auth
// ---------------------------------------------------------------------------

describe("POST /api/hub-access-requests — auth", () => {
  it("returns 401 when not authenticated", async () => {
    mockSupabaseAuth.getUser.mockResolvedValue({ data: { user: null } });

    const res = await POST(makeRequest({ hub_id: "hub-uuid-1" }));
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST — role check
// ---------------------------------------------------------------------------

describe("POST /api/hub-access-requests — role check", () => {
  it("returns 403 for non-buyer roles", async () => {
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === "profiles") {
        return makeChain({
          data: { id: "buyer-uuid-1", role: "seller", contact_name: "Maria", company_name: null, email: "maria@farm.com" },
          error: null,
        });
      }
      return makeChain({ data: null, error: null });
    });

    const res = await POST(makeRequest({ hub_id: "hub-uuid-1" }));
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST — happy path
// ---------------------------------------------------------------------------

describe("POST /api/hub-access-requests — happy path", () => {
  it("creates a pending request and sends email to hub owner", async () => {
    // User client: profile lookup + hub lookup
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === "profiles") {
        return makeChain({
          data: { id: "buyer-uuid-1", role: "buyer", contact_name: "Alice", company_name: "Alice's Roastery", email: "buyer@roastery.com" },
          error: null,
        });
      }
      if (table === "hubs") {
        return makeChain({
          data: { id: "hub-uuid-1", name: "Portland Hub", owner_id: "owner-uuid-1" },
          error: null,
        });
      }
      return makeChain({ data: null, error: null });
    });

    // Admin client: membership check, pending check, cooldown check, insert, owner profile
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "hub_members") {
        return makeChain({ data: null, error: null }); // no active membership
      }
      if (table === "hub_access_requests") {
        // First call: pending check (maybeSingle → null)
        // Second call: cooldown check (maybeSingle → null)
        // Third call: insert
        const chain = makeChain({ data: null, error: null });
        // Override insert to return the created record
        (chain.insert as ReturnType<typeof vi.fn>).mockReturnValue(
          makeChain({
            data: { id: "req-uuid-1", hub_id: "hub-uuid-1", user_id: "buyer-uuid-1", status: "pending" },
            error: null,
          })
        );
        return chain;
      }
      if (table === "profiles") {
        return makeChain({
          data: { email: "owner@hub.com", contact_name: "Carlos" },
          error: null,
        });
      }
      return makeChain({ data: null, error: null });
    });

    const res = await POST(makeRequest({ hub_id: "hub-uuid-1" }));
    expect(res.status).toBe(201);

    expect(mockSendEmail).toHaveBeenCalledOnce();
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        hubOwner: expect.objectContaining({ email: "owner@hub.com" }),
        hubName: "Portland Hub",
      })
    );
  });
});

// ---------------------------------------------------------------------------
// POST — already in a hub
// ---------------------------------------------------------------------------

describe("POST /api/hub-access-requests — already in hub", () => {
  it("returns 409 if buyer is already an active hub member", async () => {
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === "profiles") {
        return makeChain({
          data: { id: "buyer-uuid-1", role: "buyer", contact_name: "Alice", company_name: null, email: "buyer@roastery.com" },
          error: null,
        });
      }
      if (table === "hubs") {
        return makeChain({
          data: { id: "hub-uuid-1", name: "Portland Hub", owner_id: "owner-uuid-1" },
          error: null,
        });
      }
      return makeChain({ data: null, error: null });
    });

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "hub_members") {
        return makeChain({ data: { id: "member-uuid-1" }, error: null }); // active membership exists
      }
      return makeChain({ data: null, error: null });
    });

    const res = await POST(makeRequest({ hub_id: "hub-uuid-1" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already a member/i);
  });
});

// ---------------------------------------------------------------------------
// POST — duplicate pending request
// ---------------------------------------------------------------------------

describe("POST /api/hub-access-requests — duplicate pending", () => {
  it("returns 409 if buyer already has a pending request", async () => {
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === "profiles") {
        return makeChain({
          data: { id: "buyer-uuid-1", role: "buyer", contact_name: "Alice", company_name: null, email: "buyer@roastery.com" },
          error: null,
        });
      }
      if (table === "hubs") {
        return makeChain({
          data: { id: "hub-uuid-1", name: "Portland Hub", owner_id: "owner-uuid-1" },
          error: null,
        });
      }
      return makeChain({ data: null, error: null });
    });

    let hubAccessCallCount = 0;
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "hub_members") {
        return makeChain({ data: null, error: null }); // no active membership
      }
      if (table === "hub_access_requests") {
        hubAccessCallCount++;
        if (hubAccessCallCount === 1) {
          // pending check — found one
          return makeChain({ data: { id: "existing-req" }, error: null });
        }
        return makeChain({ data: null, error: null });
      }
      return makeChain({ data: null, error: null });
    });

    const res = await POST(makeRequest({ hub_id: "hub-uuid-1" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/pending request/i);
  });
});

// ---------------------------------------------------------------------------
// POST — cooldown after denial
// ---------------------------------------------------------------------------

describe("POST /api/hub-access-requests — cooldown", () => {
  it("returns 429 if requesting same hub within 7-day cooldown", async () => {
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === "profiles") {
        return makeChain({
          data: { id: "buyer-uuid-1", role: "buyer", contact_name: "Alice", company_name: null, email: "buyer@roastery.com" },
          error: null,
        });
      }
      if (table === "hubs") {
        return makeChain({
          data: { id: "hub-uuid-1", name: "Portland Hub", owner_id: "owner-uuid-1" },
          error: null,
        });
      }
      return makeChain({ data: null, error: null });
    });

    let hubAccessCallCount = 0;
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "hub_members") {
        return makeChain({ data: null, error: null });
      }
      if (table === "hub_access_requests") {
        hubAccessCallCount++;
        if (hubAccessCallCount === 1) {
          return makeChain({ data: null, error: null }); // no pending
        }
        if (hubAccessCallCount === 2) {
          // recent denial — 2 days ago (within cooldown)
          return makeChain({
            data: { id: "denied-req", updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
            error: null,
          });
        }
        return makeChain({ data: null, error: null });
      }
      return makeChain({ data: null, error: null });
    });

    const res = await POST(makeRequest({ hub_id: "hub-uuid-1" }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toMatch(/7 days/i);
  });
});

// ---------------------------------------------------------------------------
// POST — validation
// ---------------------------------------------------------------------------

describe("POST /api/hub-access-requests — validation", () => {
  it("returns 400 if hub_id is missing", async () => {
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === "profiles") {
        return makeChain({
          data: { id: "buyer-uuid-1", role: "buyer", contact_name: "Alice", company_name: null, email: "buyer@roastery.com" },
          error: null,
        });
      }
      return makeChain({ data: null, error: null });
    });

    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 404 if hub does not exist or is inactive", async () => {
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === "profiles") {
        return makeChain({
          data: { id: "buyer-uuid-1", role: "buyer", contact_name: "Alice", company_name: null, email: "buyer@roastery.com" },
          error: null,
        });
      }
      if (table === "hubs") {
        return makeChain({ data: null, error: null }); // hub not found
      }
      return makeChain({ data: null, error: null });
    });

    const res = await POST(makeRequest({ hub_id: "nonexistent-hub" }));
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET — buyer's own requests
// ---------------------------------------------------------------------------

describe("GET /api/hub-access-requests", () => {
  it("returns 401 when not authenticated", async () => {
    mockSupabaseAuth.getUser.mockResolvedValue({ data: { user: null } });

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the buyer's requests", async () => {
    const mockRequests = [
      { id: "req-1", hub_id: "hub-1", user_id: "buyer-uuid-1", status: "pending" },
      { id: "req-2", hub_id: "hub-2", user_id: "buyer-uuid-1", status: "denied" },
    ];

    mockSupabaseFrom.mockReturnValue(makeChain({ data: mockRequests, error: null }));

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
  });
});

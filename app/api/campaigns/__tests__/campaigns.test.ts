/**
 * Tests for campaign creation API route.
 *
 * POST /api/campaigns — hub owner creates an exclusive campaign for a lot
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

import { POST } from "@/app/api/campaigns/route";

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
      reject?: (e: unknown) => void,
    ) => Promise.resolve(response).then(resolve, reject),
  };
  (["select", "eq", "neq", "in", "order", "limit", "insert", "update"] as const).forEach(
    (method) => {
      (chain[method] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    },
  );
  return chain;
}

function makeRequest(body?: Record<string, unknown>): Request {
  return new Request("http://localhost/api/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** Returns an ISO string N days from now. */
function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const validBody = () => ({
  hub_id: "hub-uuid-1",
  lot_id: "lot-uuid-1",
  deadline: daysFromNow(7),
});

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabaseAuth.getUser.mockResolvedValue({
    data: { user: { id: "owner-uuid-1", email: "owner@roastery.com" } },
  });
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

describe("POST /api/campaigns — auth", () => {
  it("returns 401 when not authenticated", async () => {
    mockSupabaseAuth.getUser.mockResolvedValue({ data: { user: null } });

    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });
});

// ---------------------------------------------------------------------------
// Deadline validation
// ---------------------------------------------------------------------------

describe("POST /api/campaigns — deadline validation", () => {
  it("returns 400 if deadline is more than 30 days from now", async () => {
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === "hubs") {
        return makeChain({ data: { id: "hub-uuid-1" }, error: null });
      }
      if (table === "lots") {
        return makeChain({
          data: { id: "lot-uuid-1", title: "Ethiopian Yirg", status: "active", expiry_date: null },
          error: null,
        });
      }
      return makeChain({ data: null, error: null });
    });

    const res = await POST(
      makeRequest({ ...validBody(), deadline: daysFromNow(31) }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/30 days/i);
  });

  it("returns 400 if deadline is past lot expiry", async () => {
    const lotExpiry = daysFromNow(10);
    const deadlinePastExpiry = daysFromNow(15);

    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === "hubs") {
        return makeChain({ data: { id: "hub-uuid-1" }, error: null });
      }
      if (table === "lots") {
        return makeChain({
          data: { id: "lot-uuid-1", title: "Ethiopian Yirg", status: "active", expiry_date: lotExpiry },
          error: null,
        });
      }
      return makeChain({ data: null, error: null });
    });

    const res = await POST(
      makeRequest({ ...validBody(), deadline: deadlinePastExpiry }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/expiry/i);
  });

  it("returns 400 if deadline is in the past", async () => {
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === "hubs") {
        return makeChain({ data: { id: "hub-uuid-1" }, error: null });
      }
      if (table === "lots") {
        return makeChain({
          data: { id: "lot-uuid-1", title: "Ethiopian Yirg", status: "active", expiry_date: null },
          error: null,
        });
      }
      return makeChain({ data: null, error: null });
    });

    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const res = await POST(
      makeRequest({ ...validBody(), deadline: pastDate }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/future/i);
  });
});

// ---------------------------------------------------------------------------
// Unique constraint (exclusivity)
// ---------------------------------------------------------------------------

describe("POST /api/campaigns — exclusivity", () => {
  it("returns 409 when lot already has an active campaign", async () => {
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === "hubs") {
        return makeChain({ data: { id: "hub-uuid-1" }, error: null });
      }
      if (table === "lots") {
        return makeChain({
          data: { id: "lot-uuid-1", title: "Ethiopian Yirg", status: "active", expiry_date: null },
          error: null,
        });
      }
      if (table === "campaigns") {
        // insert chain that returns a unique constraint error
        const chain = makeChain({ data: null, error: null });
        (chain.insert as ReturnType<typeof vi.fn>).mockReturnValue(
          makeChain({
            data: null,
            error: { code: "23505", message: "duplicate key value violates unique constraint" },
          }),
        );
        return chain;
      }
      return makeChain({ data: null, error: null });
    });

    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already been claimed/i);
  });
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("POST /api/campaigns — happy path", () => {
  it("returns 201 on successful campaign creation", async () => {
    const deadline = daysFromNow(7);
    const campaignRecord = {
      id: "campaign-uuid-1",
      hub_id: "hub-uuid-1",
      lot_id: "lot-uuid-1",
      deadline,
      status: "active",
    };

    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === "hubs") {
        return makeChain({ data: { id: "hub-uuid-1" }, error: null });
      }
      if (table === "lots") {
        return makeChain({
          data: { id: "lot-uuid-1", title: "Ethiopian Yirg", status: "active", expiry_date: null },
          error: null,
        });
      }
      if (table === "campaigns") {
        const chain = makeChain({ data: null, error: null });
        (chain.insert as ReturnType<typeof vi.fn>).mockReturnValue(
          makeChain({ data: campaignRecord, error: null }),
        );
        return chain;
      }
      return makeChain({ data: null, error: null });
    });

    const res = await POST(makeRequest({ ...validBody(), deadline }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("campaign-uuid-1");
    expect(body.status).toBe("active");
  });
});

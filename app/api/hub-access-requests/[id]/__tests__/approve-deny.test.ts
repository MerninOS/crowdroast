/**
 * Tests for PATCH /api/hub-access-requests/[id] — approve/deny.
 *
 * Mocks Supabase admin client and email functions.
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

// Mock emails
vi.mock("@/lib/email", () => ({
  sendHubAccessApprovedEmail: vi.fn().mockResolvedValue({ success: true }),
  sendHubAccessDeniedEmail: vi.fn().mockResolvedValue({ success: true }),
}));

import { PATCH } from "@/app/api/hub-access-requests/[id]/route";
import { sendHubAccessApprovedEmail, sendHubAccessDeniedEmail } from "@/lib/email";

const mockApprovedEmail = vi.mocked(sendHubAccessApprovedEmail);
const mockDeniedEmail = vi.mocked(sendHubAccessDeniedEmail);

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

function makeRequest(action: string): Request {
  return new Request("http://localhost/api/hub-access-requests/req-uuid-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
}

const mockParams = Promise.resolve({ id: "req-uuid-1" });

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabaseAuth.getUser.mockResolvedValue({
    data: { user: { id: "owner-uuid-1" } },
  });
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

describe("PATCH /api/hub-access-requests/[id] — auth", () => {
  it("returns 401 when not authenticated", async () => {
    mockSupabaseAuth.getUser.mockResolvedValue({ data: { user: null } });

    const res = await PATCH(makeRequest("approve"), { params: mockParams });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid action", async () => {
    mockAdminFrom.mockReturnValue(
      makeChain({ data: null, error: null })
    );

    const req = new Request("http://localhost/api/hub-access-requests/req-uuid-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "invalid" }),
    });

    const res = await PATCH(req, { params: mockParams });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Approve — happy path
// ---------------------------------------------------------------------------

describe("PATCH /api/hub-access-requests/[id] — approve", () => {
  it("approves a pending request, creates hub_member, sends email", async () => {
    let insertCalled = false;

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "hub_access_requests") {
        const chain = makeChain({
          data: {
            id: "req-uuid-1",
            hub_id: "hub-uuid-1",
            user_id: "buyer-uuid-1",
            status: "pending",
            hub: { id: "hub-uuid-1", name: "Portland Hub", owner_id: "owner-uuid-1" },
          },
          error: null,
        });
        // update calls return successfully
        return chain;
      }
      if (table === "hub_members") {
        insertCalled = true;
        return makeChain({ data: null, error: null }); // insert succeeds
      }
      if (table === "profiles") {
        return makeChain({
          data: { id: "buyer-uuid-1", email: "buyer@roastery.com", contact_name: "Alice", company_name: null },
          error: null,
        });
      }
      return makeChain({ data: null, error: null });
    });

    const res = await PATCH(makeRequest("approve"), { params: mockParams });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("approved");
    expect(insertCalled).toBe(true);
    expect(mockApprovedEmail).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Deny — happy path
// ---------------------------------------------------------------------------

describe("PATCH /api/hub-access-requests/[id] — deny", () => {
  it("denies a pending request and sends denial email", async () => {
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "hub_access_requests") {
        return makeChain({
          data: {
            id: "req-uuid-1",
            hub_id: "hub-uuid-1",
            user_id: "buyer-uuid-1",
            status: "pending",
            hub: { id: "hub-uuid-1", name: "Portland Hub", owner_id: "owner-uuid-1" },
          },
          error: null,
        });
      }
      if (table === "profiles") {
        return makeChain({
          data: { id: "buyer-uuid-1", email: "buyer@roastery.com", contact_name: "Alice", company_name: null },
          error: null,
        });
      }
      return makeChain({ data: null, error: null });
    });

    const res = await PATCH(makeRequest("deny"), { params: mockParams });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("denied");
    expect(mockDeniedEmail).toHaveBeenCalledOnce();
    expect(mockApprovedEmail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Idempotent — already processed
// ---------------------------------------------------------------------------

describe("PATCH /api/hub-access-requests/[id] — idempotent", () => {
  it("returns current state without side effects if already approved", async () => {
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "hub_access_requests") {
        return makeChain({
          data: {
            id: "req-uuid-1",
            hub_id: "hub-uuid-1",
            user_id: "buyer-uuid-1",
            status: "approved", // already processed
            hub: { id: "hub-uuid-1", name: "Portland Hub", owner_id: "owner-uuid-1" },
          },
          error: null,
        });
      }
      return makeChain({ data: null, error: null });
    });

    const res = await PATCH(makeRequest("approve"), { params: mockParams });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("approved");
    expect(body.message).toMatch(/already/i);
    expect(mockApprovedEmail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Forbidden — non-hub-owner
// ---------------------------------------------------------------------------

describe("PATCH /api/hub-access-requests/[id] — authorization", () => {
  it("returns 403 if caller is not the hub owner", async () => {
    mockSupabaseAuth.getUser.mockResolvedValue({
      data: { user: { id: "some-other-user" } }, // not the hub owner
    });

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "hub_access_requests") {
        return makeChain({
          data: {
            id: "req-uuid-1",
            hub_id: "hub-uuid-1",
            user_id: "buyer-uuid-1",
            status: "pending",
            hub: { id: "hub-uuid-1", name: "Portland Hub", owner_id: "owner-uuid-1" },
          },
          error: null,
        });
      }
      return makeChain({ data: null, error: null });
    });

    const res = await PATCH(makeRequest("approve"), { params: mockParams });
    expect(res.status).toBe(403);
    expect(mockApprovedEmail).not.toHaveBeenCalled();
  });
});

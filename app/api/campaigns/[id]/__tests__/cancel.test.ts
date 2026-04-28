/**
 * Tests for campaign cancellation PATCH route.
 *
 * PATCH /api/campaigns/[id] with { status: "cancelled" } — hub owner cancels
 * their active campaign. After cancel, the lot recycles back to the seller.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// User-scoped supabase client (used for ownership/auth checks + commitment cancel)
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

// Admin client (only used for the recycle_lot RPC)
type RpcCall = { fn: string; args: unknown };
const adminRpcCalls: RpcCall[] = [];
const adminFrom = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (...args: unknown[]) => adminFrom(...args),
    rpc: vi.fn((fn: string, args: unknown) => {
      adminRpcCalls.push({ fn, args });
      return Promise.resolve({ data: null, error: null });
    }),
  })),
}));

import { PATCH } from "@/app/api/campaigns/[id]/route";

function makeChain(response: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(response),
    maybeSingle: vi.fn().mockResolvedValue(response),
    then: (
      resolve: (v: { data: unknown; error: unknown }) => void,
      reject?: (e: unknown) => void,
    ) => Promise.resolve(response).then(resolve, reject),
  };
  (["select", "eq", "neq", "in", "update"] as const).forEach((m) => {
    (chain[m] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  });
  return chain;
}

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/campaigns/camp-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "camp-1" });

beforeEach(() => {
  vi.clearAllMocks();
  adminRpcCalls.length = 0;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
});

describe("PATCH /api/campaigns/[id]", () => {
  it("calls finalize_campaign with outcome=cancelled after a hub owner cancels", async () => {
    mockSupabaseAuth.getUser.mockResolvedValue({
      data: { user: { id: "owner-1" } },
    });

    // Sequence (route now collapses the campaign update + commitments cancel
    // + lot recycle into a single finalize_campaign RPC):
    //  1. fetch campaign — found, active, lot-1, hub-1
    //  2. fetch hub for ownership — owner matches
    mockSupabaseFrom
      .mockReturnValueOnce(
        makeChain({
          data: { id: "camp-1", hub_id: "hub-1", lot_id: "lot-1", status: "active" },
          error: null,
        })
      )
      .mockReturnValueOnce(makeChain({ data: { id: "hub-1" }, error: null }));

    const res = await PATCH(makeRequest({ status: "cancelled" }), { params });
    expect(res.status).toBe(200);

    expect(adminRpcCalls).toEqual([
      {
        fn: "finalize_campaign",
        args: { p_campaign_id: "camp-1", p_outcome: "cancelled" },
      },
    ]);
  });

  it("does not recycle when the caller is not the hub owner", async () => {
    mockSupabaseAuth.getUser.mockResolvedValue({
      data: { user: { id: "other-user" } },
    });

    // Sequence:
    //  1. fetch campaign — found
    //  2. fetch hub for ownership — null (caller is not the owner)
    mockSupabaseFrom
      .mockReturnValueOnce(
        makeChain({
          data: { id: "camp-1", hub_id: "hub-1", lot_id: "lot-1", status: "active" },
          error: null,
        })
      )
      .mockReturnValueOnce(makeChain({ data: null, error: null }));

    const res = await PATCH(makeRequest({ status: "cancelled" }), { params });
    expect(res.status).toBe(403);
    expect(adminRpcCalls).toEqual([]);
  });

  it("does not recycle when the campaign is not active", async () => {
    mockSupabaseAuth.getUser.mockResolvedValue({
      data: { user: { id: "owner-1" } },
    });

    mockSupabaseFrom.mockReturnValueOnce(
      makeChain({
        data: { id: "camp-1", hub_id: "hub-1", lot_id: "lot-1", status: "settled" },
        error: null,
      })
    );

    const res = await PATCH(makeRequest({ status: "cancelled" }), { params });
    expect(res.status).toBe(400);
    expect(adminRpcCalls).toEqual([]);
  });
});

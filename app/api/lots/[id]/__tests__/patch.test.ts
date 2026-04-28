/**
 * Tests for the PATCH /api/lots/[id] guard relaxation.
 *
 * Old behavior: any commitment row on the lot (regardless of campaign state)
 * blocked the PATCH with 409. After this change, only an *active* campaign
 * blocks edits — historical commitments from closed campaigns are fine.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

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

import { PATCH } from "@/app/api/lots/[id]/route";

function makeChain(response: { data: unknown; error: unknown }, opts?: { count?: number }) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(response),
    maybeSingle: vi.fn().mockResolvedValue(response),
    then: (
      resolve: (v: { data: unknown; error: unknown; count?: number }) => void,
      reject?: (e: unknown) => void,
    ) => Promise.resolve({ ...response, count: opts?.count }).then(resolve, reject),
  };
  (["select", "eq", "in", "update", "insert", "delete", "not", "order"] as const).forEach(
    (m) => {
      (chain[m] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    },
  );
  return chain;
}

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/lots/lot-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "lot-1" });

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabaseAuth.getUser.mockResolvedValue({ data: { user: { id: "seller-1" } } });
});

describe("PATCH /api/lots/[id] — campaign-status guard", () => {
  it("allows status PATCH when no active campaign exists, even with historical commitments", async () => {
    // Sequence:
    //  1. ownership check
    //  2. active-campaign lookup → none
    //  3. update lots (status-only branch)
    mockSupabaseFrom
      .mockReturnValueOnce(
        makeChain({ data: { id: "lot-1", seller_id: "seller-1" }, error: null })
      )
      .mockReturnValueOnce(makeChain({ data: null, error: null })) // no active campaign
      .mockReturnValueOnce(
        makeChain({
          data: { id: "lot-1", status: "active" },
          error: null,
        })
      );

    const res = await PATCH(makeRequest({ status: "active" }), { params });
    expect(res.status).toBe(200);
  });

  it("rejects status PATCH with 409 when an active campaign exists", async () => {
    mockSupabaseFrom
      .mockReturnValueOnce(
        makeChain({ data: { id: "lot-1", seller_id: "seller-1" }, error: null })
      )
      .mockReturnValueOnce(
        makeChain({
          data: { id: "camp-1" },
          error: null,
        })
      ); // active campaign found

    const res = await PATCH(makeRequest({ status: "draft" }), { params });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/active campaign/i);
  });

  it("rejects an attempt to PATCH status='awaiting_relist' (system-set only)", async () => {
    mockSupabaseFrom
      .mockReturnValueOnce(
        makeChain({ data: { id: "lot-1", seller_id: "seller-1" }, error: null })
      )
      .mockReturnValueOnce(makeChain({ data: null, error: null })); // no active campaign

    const res = await PATCH(makeRequest({ status: "awaiting_relist" }), { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/active or draft/i);
  });
});

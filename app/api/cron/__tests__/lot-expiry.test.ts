/**
 * Tests for lot-expiry cron route.
 *
 * GET /api/cron/lot-expiry — expire lots past their expiry_date
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (...args: unknown[]) => mockFrom(...args),
  })),
}));

vi.mock("@/lib/email", () => ({
  sendLotExpiredEmail: vi.fn().mockResolvedValue({ success: true }),
}));

import { GET } from "@/app/api/cron/lot-expiry/route";
import { sendLotExpiredEmail } from "@/lib/email";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a chainable Supabase query mock. */
function makeChain(response: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(response),
    then: (
      resolve: (v: { data: unknown; error: unknown }) => void,
      reject?: (e: unknown) => void,
    ) => Promise.resolve(response).then(resolve, reject),
  };
  (["select", "eq", "neq", "in", "lte", "update"] as const).forEach((m) => {
    (chain[m] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  });
  return chain;
}

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/cron/lot-expiry", {
    method: "GET",
    headers,
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const CRON_SECRET = "test-cron-secret";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = CRON_SECRET;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/cron/lot-expiry", () => {
  it("returns 401 without valid cron secret", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 with wrong cron secret", async () => {
    const res = await GET(makeRequest({ authorization: "Bearer wrong-secret" }));
    expect(res.status).toBe(401);
  });

  it("accepts bearer token auth", async () => {
    // No lots to process
    const lotsChain = makeChain({ data: [], error: null });
    mockFrom.mockReturnValue(lotsChain);

    const res = await GET(makeRequest({ authorization: `Bearer ${CRON_SECRET}` }));
    expect(res.status).toBe(200);
  });

  it("accepts x-cron-secret header auth", async () => {
    const lotsChain = makeChain({ data: [], error: null });
    mockFrom.mockReturnValue(lotsChain);

    const res = await GET(makeRequest({ "x-cron-secret": CRON_SECRET }));
    expect(res.status).toBe(200);
  });

  it("expires lots past expiry_date with no active/settled campaigns", async () => {
    const expiredLot = {
      id: "lot-1",
      title: "Ethiopian Yirgacheffe",
      seller_id: "seller-1",
    };

    const sellerProfile = {
      email: "seller@example.com",
      contact_name: "Jane Seller",
    };

    // First call: lots query
    const lotsChain = makeChain({ data: [expiredLot], error: null });
    // Second call: campaigns query (no active/settled campaigns)
    const campaignsChain = makeChain({ data: [], error: null });
    // Third call: lots update
    const updateChain = makeChain({ data: null, error: null });
    // Fourth call: profiles query
    const profilesChain = makeChain({ data: sellerProfile, error: null });

    mockFrom
      .mockReturnValueOnce(lotsChain)       // lots select
      .mockReturnValueOnce(campaignsChain)  // campaigns select
      .mockReturnValueOnce(updateChain)     // lots update
      .mockReturnValueOnce(profilesChain);  // profiles select

    const res = await GET(makeRequest({ authorization: `Bearer ${CRON_SECRET}` }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.expired_lots).toBe(1);
    expect(body.checked_lots).toBe(1);

    // Verify lot was updated
    expect(mockFrom).toHaveBeenCalledWith("lots");
    expect(mockFrom).toHaveBeenCalledWith("campaigns");
    expect(mockFrom).toHaveBeenCalledWith("profiles");

    // Verify email was sent
    expect(sendLotExpiredEmail).toHaveBeenCalledWith({
      seller: { email: "seller@example.com", contact_name: "Jane Seller" },
      lot: { id: "lot-1", title: "Ethiopian Yirgacheffe" },
    });
  });

  it("skips lots that have an active campaign", async () => {
    const lotWithCampaign = {
      id: "lot-2",
      title: "Colombian Supremo",
      seller_id: "seller-2",
    };

    // First call: lots query
    const lotsChain = makeChain({ data: [lotWithCampaign], error: null });
    // Second call: campaigns query — has an active campaign
    const campaignsChain = makeChain({
      data: [{ id: "campaign-1", status: "active" }],
      error: null,
    });

    mockFrom
      .mockReturnValueOnce(lotsChain)
      .mockReturnValueOnce(campaignsChain);

    const res = await GET(makeRequest({ authorization: `Bearer ${CRON_SECRET}` }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.expired_lots).toBe(0);
    expect(body.checked_lots).toBe(1);

    // No email should be sent
    expect(sendLotExpiredEmail).not.toHaveBeenCalled();
  });

  it("skips lots that have a settled campaign", async () => {
    const lotWithSettled = {
      id: "lot-3",
      title: "Kenyan AA",
      seller_id: "seller-3",
    };

    const lotsChain = makeChain({ data: [lotWithSettled], error: null });
    const campaignsChain = makeChain({
      data: [{ id: "campaign-2", status: "settled" }],
      error: null,
    });

    mockFrom
      .mockReturnValueOnce(lotsChain)
      .mockReturnValueOnce(campaignsChain);

    const res = await GET(makeRequest({ authorization: `Bearer ${CRON_SECRET}` }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.expired_lots).toBe(0);
    expect(body.checked_lots).toBe(1);

    expect(sendLotExpiredEmail).not.toHaveBeenCalled();
  });
});

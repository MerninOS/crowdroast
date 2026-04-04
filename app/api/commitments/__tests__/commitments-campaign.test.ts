/**
 * Tests for commitment creation requiring an active campaign.
 *
 * POST /api/commitments — buyer creates a commitment tied to a campaign
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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

vi.mock("@/lib/stripe", () => ({
  createStripeCustomer: vi.fn().mockResolvedValue({ id: "cus_test123" }),
  createPaymentCheckoutSession: vi
    .fn()
    .mockResolvedValue({ id: "cs_test123", url: "https://checkout.stripe.com/test" }),
}));

vi.mock("@/lib/pricing", () => ({
  addPlatformFee: vi.fn((price: number) => price * 1.1),
}));

import { POST } from "@/app/api/commitments/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChain(response: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
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
  (
    ["select", "eq", "neq", "is", "in", "order", "limit", "insert", "update"] as const
  ).forEach((method) => {
    (chain[method] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  });
  return chain;
}

function makeRequest(body?: Record<string, unknown>): Request {
  return new Request("http://localhost/api/commitments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: "http://localhost:3000",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const activeLot = {
  id: "lot-uuid-1",
  title: "Ethiopian Yirgacheffe",
  status: "active",
  seller_id: "seller-uuid-1",
  total_quantity_kg: 100,
  committed_quantity_kg: 0,
  commitment_deadline: null,
  price_per_kg: 20,
  currency: "USD",
};

const validBody = () => ({
  lot_id: "lot-uuid-1",
  hub_id: "hub-uuid-1",
  quantity_kg: 10,
});

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
// Campaign requirement tests
// ---------------------------------------------------------------------------

describe("POST /api/commitments — campaign requirement", () => {
  it("returns 400 when lot has no active campaign for the buyer's hub", async () => {
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === "lots") {
        return makeChain({ data: activeLot, error: null });
      }
      if (table === "campaigns") {
        // No active campaign found — single() returns error
        return makeChain({
          data: null,
          error: { code: "PGRST116", message: "no rows returned" },
        });
      }
      return makeChain({ data: null, error: null });
    });

    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no active campaign/i);
  });

  it("returns 400 when campaign deadline has passed", async () => {
    const pastDeadline = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === "lots") {
        return makeChain({ data: activeLot, error: null });
      }
      if (table === "campaigns") {
        return makeChain({
          data: {
            id: "campaign-uuid-1",
            deadline: pastDeadline,
            status: "active",
          },
          error: null,
        });
      }
      return makeChain({ data: null, error: null });
    });

    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/campaign deadline has passed/i);
  });
});

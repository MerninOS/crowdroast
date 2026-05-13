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
  createSetupCheckoutSession: vi
    .fn()
    .mockResolvedValue({ id: "cs_setup_test123", url: "https://checkout.stripe.com/setup-test" }),
}));

import {
  createPaymentCheckoutSession,
  createSetupCheckoutSession,
} from "@/lib/stripe";

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
  // Bag-aware close (Task 1.9): commits require a backfilled bag size.
  // These tests exercise downstream gates, so the lot is fully configured.
  bag_size_kg: 10,
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
        // No active campaign found — maybeSingle() returns null with no error
        return makeChain({ data: null, error: null });
      }
      return makeChain({ data: null, error: null });
    });

    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no active campaign/i);
  });

  it("returns split { locked_kg, filling_kg } based on bag_size_kg after a successful commit", async () => {
    // Lot configured for bag-aware split: 60kg bags, lot has no prior commits.
    // Buyer commits 100kg → only commit on the campaign → 60 locked (one full bag),
    // 40 filling (partial second bag).
    const splitLot = {
      ...activeLot,
      id: "lot-uuid-split",
      total_quantity_kg: 600,
      committed_quantity_kg: 0,
      bag_size_kg: 60,
    };

    const newCommitId = "commit-uuid-new";
    const newCommitCreatedAt = new Date("2026-05-12T12:00:00Z").toISOString();

    let commitmentsCall = 0;
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === "lots") {
        return makeChain({ data: splitLot, error: null });
      }
      if (table === "campaigns") {
        return makeChain({
          data: {
            id: "campaign-uuid-split",
            deadline: daysFromNow(7),
            status: "active",
          },
          error: null,
        });
      }
      if (table === "pricing_tiers") {
        return makeChain({ data: [], error: null });
      }
      if (table === "profiles") {
        return makeChain({
          data: {
            email: "buyer@roastery.com",
            stripe_customer_id: "cus_existing",
          },
          error: null,
        });
      }
      if (table === "commitments") {
        commitmentsCall += 1;
        // 1st call: existingUnpaidCommitment lookup → none
        if (commitmentsCall === 1) {
          return makeChain({ data: null, error: null });
        }
        // 2nd call: insert + select().single() → return the new commit row
        if (commitmentsCall === 2) {
          return makeChain({
            data: {
              id: newCommitId,
              quantity_kg: 100,
              created_at: newCommitCreatedAt,
            },
            error: null,
          });
        }
        // 3rd call: campaign commits load for assignKgToBags — only this commit
        if (commitmentsCall === 3) {
          return makeChain({
            data: [
              {
                id: newCommitId,
                quantity_kg: 100,
                created_at: newCommitCreatedAt,
              },
            ],
            error: null,
          });
        }
        // 4th call: post-Stripe update of stripe_checkout_session_id
        return makeChain({ data: null, error: null });
      }
      return makeChain({ data: null, error: null });
    });

    const res = await POST(
      makeRequest({
        lot_id: splitLot.id,
        hub_id: "hub-uuid-1",
        quantity_kg: 100,
      })
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.split).toEqual({ locked_kg: 60, filling_kg: 40 });
    // Bag-aware path (Task 4.3a): lots with bag_size_kg save the card via a
    // setup-mode Checkout Session instead of charging at commit. The response
    // surfaces `setup_client_secret` (the hosted setup URL) and NOT
    // `checkout_url`. No mode-payment session should be created.
    expect(body.commitment).toBeDefined();
    expect(body.setup_client_secret).toBe("https://checkout.stripe.com/setup-test");
    expect(body.checkout_url).toBeUndefined();
    expect(createSetupCheckoutSession).toHaveBeenCalledTimes(1);
    expect(createPaymentCheckoutSession).not.toHaveBeenCalled();
  });

  it("bag-aware lots do not charge at commit (createPaymentCheckoutSession is never called)", async () => {
    // Belt-and-suspenders companion to the split test above: an explicit
    // assertion that AC5 holds — no payment-mode session is created for a
    // bag-aware lot, even when the split path is trivial (single bag).
    const bagAwareLot = {
      ...activeLot,
      id: "lot-bag-aware",
      bag_size_kg: 60,
      total_quantity_kg: 600,
    };

    const newCommitId = "commit-bag-aware-new";
    const newCommitCreatedAt = new Date("2026-05-13T12:00:00Z").toISOString();

    let commitmentsCall = 0;
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === "lots") {
        return makeChain({ data: bagAwareLot, error: null });
      }
      if (table === "campaigns") {
        return makeChain({
          data: {
            id: "campaign-bag-aware",
            deadline: daysFromNow(7),
            status: "active",
          },
          error: null,
        });
      }
      if (table === "pricing_tiers") {
        return makeChain({ data: [], error: null });
      }
      if (table === "profiles") {
        return makeChain({
          data: { email: "buyer@roastery.com", stripe_customer_id: "cus_existing" },
          error: null,
        });
      }
      if (table === "commitments") {
        commitmentsCall += 1;
        if (commitmentsCall === 1) return makeChain({ data: null, error: null });
        if (commitmentsCall === 2) {
          return makeChain({
            data: { id: newCommitId, quantity_kg: 60, created_at: newCommitCreatedAt },
            error: null,
          });
        }
        if (commitmentsCall === 3) {
          return makeChain({
            data: [{ id: newCommitId, quantity_kg: 60, created_at: newCommitCreatedAt }],
            error: null,
          });
        }
        return makeChain({ data: null, error: null });
      }
      return makeChain({ data: null, error: null });
    });

    const res = await POST(
      makeRequest({
        lot_id: bagAwareLot.id,
        hub_id: "hub-uuid-1",
        quantity_kg: 60,
      })
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.setup_client_secret).toBeDefined();
    expect(body.checkout_url).toBeUndefined();
    expect(createPaymentCheckoutSession).not.toHaveBeenCalled();
    expect(createSetupCheckoutSession).toHaveBeenCalledTimes(1);
    // Verify the helper got the customer + lot context — strict signature check.
    expect(createSetupCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "cus_existing",
        commitmentId: newCommitId,
        lotId: bagAwareLot.id,
        currency: "USD",
      })
    );
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

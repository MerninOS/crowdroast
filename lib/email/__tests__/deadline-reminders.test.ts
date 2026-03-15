/**
 * Pattern 2 — Cron-Triggered
 *
 * Tests the deadline-reminders cron handler directly.
 * Mocks the Supabase admin client and the email send function.
 *
 * Verifies:
 * - Auth guard (missing or wrong CRON_SECRET → 401)
 * - Happy path: lots 24-48h from deadline → non-committed buyers receive reminders
 * - Failure path: lot outside the 24-48h window → no emails sent
 * - Conditional exclusion: buyers who already committed → excluded from reminders
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock admin client before importing the route so the module initialises cleanly
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendDeadlineReminderEmail: vi.fn().mockResolvedValue({ success: true }),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { sendDeadlineReminderEmail } from "@/lib/email";
import { GET } from "@/app/api/cron/deadline-reminders/route";

const mockCreateAdminClient = vi.mocked(createAdminClient);
const mockSendReminder = vi.mocked(sendDeadlineReminderEmail);

const CRON_SECRET = "test-cron-secret";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a minimal thenable Supabase query chain that resolves to `response`. */
function makeChain(response: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(response),
    maybeSingle: vi.fn().mockResolvedValue(response),
    // Make the chain itself awaitable (for queries without .single())
    then: (
      resolve: (v: { data: unknown; error: unknown }) => void,
      reject?: (e: unknown) => void
    ) => Promise.resolve(response).then(resolve, reject),
  };
  // Every chainable method returns `chain` itself
  (["select", "eq", "in", "gte", "lte", "not", "neq", "order", "limit"] as const).forEach(
    (method) => {
      (chain[method] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    }
  );
  return chain;
}

function makeRequest(secret?: string): Request {
  return new Request("http://localhost/api/cron/deadline-reminders", {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

const now = new Date();
const inWindow = new Date(now.getTime() + 30 * 60 * 60 * 1000).toISOString(); // 30h from now
const outsideWindow = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString(); // 72h from now

const mockLot = {
  id: "lot-uuid-1",
  title: "Ethiopia Natural",
  price_per_kg: 12,
  currency: "USD",
  commitment_deadline: inWindow,
};

const mockHubLots = [
  { hub_id: "hub-uuid-1", hubs: { id: "hub-uuid-1", name: "Portland Hub" } },
];

const mockCommitments: unknown[] = []; // no existing commitments by default

const mockMembers = [
  {
    user_id: "user-uuid-1",
    profiles: { id: "user-uuid-1", email: "buyer@roastery.com", contact_name: "Alice" },
  },
];

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  process.env.CRON_SECRET = CRON_SECRET;
  mockSendReminder.mockClear();
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------

describe("deadline-reminders cron — auth", () => {
  it("returns 401 when Authorization header is missing", async () => {
    mockCreateAdminClient.mockReturnValue({ from: vi.fn() } as unknown as ReturnType<typeof createAdminClient>);
    const res = await GET(makeRequest()); // no secret
    expect(res.status).toBe(401);
  });

  it("returns 401 when wrong secret is provided", async () => {
    mockCreateAdminClient.mockReturnValue({ from: vi.fn() } as unknown as ReturnType<typeof createAdminClient>);
    const res = await GET(makeRequest("wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("returns 200 with correct secret", async () => {
    mockCreateAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue(makeChain({ data: [], error: null })),
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await GET(makeRequest(CRON_SECRET));
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Happy path — lot in window, buyer has not committed
// ---------------------------------------------------------------------------

describe("deadline-reminders cron — happy path", () => {
  it("sends a reminder to a non-committed buyer when a lot is 24-48h from deadline", async () => {
    mockCreateAdminClient.mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "lots") return makeChain({ data: [mockLot], error: null });
        if (table === "hub_lots") return makeChain({ data: mockHubLots, error: null });
        if (table === "commitments") return makeChain({ data: mockCommitments, error: null });
        if (table === "hub_members") return makeChain({ data: mockMembers, error: null });
        return makeChain({ data: [], error: null });
      }),
    } as unknown as ReturnType<typeof createAdminClient>);

    await GET(makeRequest(CRON_SECRET));

    expect(mockSendReminder).toHaveBeenCalledOnce();
    expect(mockSendReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        buyer: expect.objectContaining({ email: "buyer@roastery.com" }),
        lot: expect.objectContaining({ title: "Ethiopia Natural" }),
        hubName: "Portland Hub",
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Failure path — lot outside window → no emails
// ---------------------------------------------------------------------------

describe("deadline-reminders cron — failure path", () => {
  it("sends no reminders when there are no lots in the 24-48h window", async () => {
    const lotOutsideWindow = { ...mockLot, commitment_deadline: outsideWindow };

    mockCreateAdminClient.mockReturnValue({
      // The query with gte/lte returns empty — no lots in window
      from: vi.fn().mockReturnValue(makeChain({ data: [], error: null })),
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await GET(makeRequest(CRON_SECRET));
    const body = await res.json() as { processed_lots: number };

    expect(mockSendReminder).not.toHaveBeenCalled();
    expect(body.processed_lots).toBe(0);
    void lotOutsideWindow; // used for documentation clarity only
  });
});

// ---------------------------------------------------------------------------
// Conditional exclusion — committed buyer is skipped (Pattern 3)
// ---------------------------------------------------------------------------

describe("deadline-reminders cron — conditional recipients", () => {
  it("does not send a reminder to a buyer who has already committed", async () => {
    const existingCommitment = [{ buyer_id: "user-uuid-1" }]; // Alice has committed

    mockCreateAdminClient.mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "lots") return makeChain({ data: [mockLot], error: null });
        if (table === "hub_lots") return makeChain({ data: mockHubLots, error: null });
        if (table === "commitments") return makeChain({ data: existingCommitment, error: null });
        if (table === "hub_members") return makeChain({ data: mockMembers, error: null });
        return makeChain({ data: [], error: null });
      }),
    } as unknown as ReturnType<typeof createAdminClient>);

    await GET(makeRequest(CRON_SECRET));

    expect(mockSendReminder).not.toHaveBeenCalled();
  });

  it("sends only to buyers who have not committed when hub has a mix", async () => {
    const membersWithTwo = [
      ...mockMembers,
      {
        user_id: "user-uuid-2",
        profiles: { id: "user-uuid-2", email: "committed@roastery.com", contact_name: "Bob" },
      },
    ];
    // Bob has committed, Alice has not
    const bobsCommitment = [{ buyer_id: "user-uuid-2" }];

    mockCreateAdminClient.mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "lots") return makeChain({ data: [mockLot], error: null });
        if (table === "hub_lots") return makeChain({ data: mockHubLots, error: null });
        if (table === "commitments") return makeChain({ data: bobsCommitment, error: null });
        if (table === "hub_members") return makeChain({ data: membersWithTwo, error: null });
        return makeChain({ data: [], error: null });
      }),
    } as unknown as ReturnType<typeof createAdminClient>);

    await GET(makeRequest(CRON_SECRET));

    // Only Alice (no commitment) should receive a reminder
    expect(mockSendReminder).toHaveBeenCalledOnce();
    expect(mockSendReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        buyer: expect.objectContaining({ email: "buyer@roastery.com" }),
      })
    );
  });
});

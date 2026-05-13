/**
 * Tests for the Stripe webhook's failure-path handlers.
 *
 * The bug these guard against: a buyer abandons checkout → no `completed`
 * webhook fires → commitment row sits in `pending_setup` with status='pending'
 * → DB trigger keeps inflating `lots.committed_quantity_kg` → settle-deadlines
 * cron flips the whole campaign to `failed`.
 *
 * Fix: cancel the commitment the moment Stripe tells us payment will not
 * complete, so the lot trigger drops the quantity immediately.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const updateCalls: Array<{
  table: string;
  payload: Record<string, unknown>;
  filters: Array<{ op: string; col: string; val: unknown }>;
}> = [];

// Lookup row returned by `.maybeSingle()` for the post-setup commitment
// lookup that joins lot + buyer. Tests override this before invoking POST
// to exercise the AC12 probe branches.
let commitmentLookup: unknown = null;

function makeChain(table: string) {
  let pendingPayload: Record<string, unknown> | null = null;
  const filters: Array<{ op: string; col: string; val: unknown }> = [];
  const chain: Record<string, unknown> = {
    update: vi.fn((payload: Record<string, unknown>) => {
      pendingPayload = payload;
      return chain;
    }),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn((col: string, val: unknown) => {
      filters.push({ op: "eq", col, val });
      return chain;
    }),
    neq: vi.fn((col: string, val: unknown) => {
      filters.push({ op: "neq", col, val });
      return chain;
    }),
    is: vi.fn((col: string, val: unknown) => {
      filters.push({ op: "is", col, val });
      return chain;
    }),
    // Post-update commitment lookup used by buyer-referral wiring and by
    // the AC12 setup-mode probe branch. For the AC12 tests we surface
    // `commitmentLookup`; for failure-path tests it stays null and helpers
    // short-circuit harmlessly.
    maybeSingle: vi.fn(async () => ({ data: commitmentLookup, error: null })),
    then: (resolve: (v: unknown) => void) => {
      if (pendingPayload) {
        updateCalls.push({ table, payload: pendingPayload, filters: [...filters] });
      }
      return Promise.resolve({ data: null, error: null }).then(resolve);
    },
  };
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => makeChain(table),
  })),
}));

const mockProbeCardAuth = vi.fn();
const mockGetSetupIntent = vi.fn();

vi.mock("@/lib/stripe", () => ({
  verifyStripeWebhookSignature: vi.fn(() => true),
  getPaymentIntent: vi.fn().mockResolvedValue({ latest_charge: null }),
  getSetupIntent: (...args: unknown[]) => mockGetSetupIntent(...args),
  probeCardAuth: (...args: unknown[]) => mockProbeCardAuth(...args),
}));

const mockSendCardAuthFailedEmail = vi.fn();

vi.mock("@/lib/email", () => ({
  sendCardAuthFailedEmail: (...args: unknown[]) => mockSendCardAuthFailedEmail(...args),
}));

import { POST } from "@/app/api/stripe/webhook/route";

function makeRequest(event: unknown): Request {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "t=123,v1=fake" },
    body: JSON.stringify(event),
  });
}

beforeEach(() => {
  updateCalls.length = 0;
  commitmentLookup = null;
  mockProbeCardAuth.mockReset();
  mockGetSetupIntent.mockReset();
  mockSendCardAuthFailedEmail.mockReset();
  mockSendCardAuthFailedEmail.mockResolvedValue({ success: true });
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
});

describe("Stripe webhook — failure events cancel commitments", () => {
  it("checkout.session.expired cancels by session id and skips already-confirmed rows", async () => {
    const res = await POST(
      makeRequest({
        id: "evt_1",
        type: "checkout.session.expired",
        data: { object: { id: "cs_abandoned" } },
      })
    );

    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    const call = updateCalls[0];
    expect(call.table).toBe("commitments");
    expect(call.payload).toMatchObject({
      status: "cancelled",
      payment_status: "cancelled",
    });
    expect(call.filters).toContainEqual({
      op: "eq",
      col: "stripe_checkout_session_id",
      val: "cs_abandoned",
    });
    // Critical: must not flip an already-confirmed commitment back to cancelled
    // if a stale `expired` event arrives after settlement.
    expect(call.filters).toContainEqual({
      op: "neq",
      col: "status",
      val: "confirmed",
    });
  });

  it("payment_intent.payment_failed cancels by metadata.commitment_id with error message", async () => {
    const res = await POST(
      makeRequest({
        id: "evt_2",
        type: "payment_intent.payment_failed",
        data: {
          object: {
            id: "pi_failed",
            last_payment_error: { message: "Your card was declined." },
            metadata: { commitment_id: "commit-xyz" },
          },
        },
      })
    );

    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].payload).toMatchObject({
      status: "cancelled",
      payment_status: "charge_failed",
      payment_error: "Your card was declined.",
    });
    expect(updateCalls[0].filters).toContainEqual({
      op: "eq",
      col: "id",
      val: "commit-xyz",
    });
  });

  it("payment_intent.payment_failed falls back to PI id when metadata is missing", async () => {
    const res = await POST(
      makeRequest({
        id: "evt_3",
        type: "payment_intent.payment_failed",
        data: { object: { id: "pi_orphan", last_payment_error: null } },
      })
    );

    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].payload).toMatchObject({
      status: "cancelled",
      payment_status: "charge_failed",
      payment_error: "Payment failed",
    });
    expect(updateCalls[0].filters).toContainEqual({
      op: "eq",
      col: "stripe_payment_intent_id",
      val: "pi_orphan",
    });
  });

  it("charge.failed cancels by metadata.commitment_id", async () => {
    const res = await POST(
      makeRequest({
        id: "evt_4",
        type: "charge.failed",
        data: {
          object: {
            id: "ch_failed",
            payment_intent: "pi_x",
            failure_message: "Insufficient funds.",
            metadata: { commitment_id: "commit-abc" },
          },
        },
      })
    );

    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].payload).toMatchObject({
      status: "cancelled",
      payment_status: "charge_failed",
      payment_error: "Insufficient funds.",
    });
    expect(updateCalls[0].filters).toContainEqual({
      op: "eq",
      col: "id",
      val: "commit-abc",
    });
  });

  it("setup_intent.setup_failed cancels via metadata.commitment_id", async () => {
    const res = await POST(
      makeRequest({
        id: "evt_5",
        type: "setup_intent.setup_failed",
        data: {
          object: {
            id: "si_failed",
            last_setup_error: { message: "Authentication failed." },
            metadata: { commitment_id: "commit-setup" },
          },
        },
      })
    );

    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].payload).toMatchObject({
      status: "cancelled",
      payment_status: "cancelled",
      payment_error: "Authentication failed.",
    });
  });

  it("checkout.session.completed in payment mode without paid status now cancels (regression: previously left status=pending)", async () => {
    const res = await POST(
      makeRequest({
        id: "evt_6",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_unpaid",
            mode: "payment",
            payment_intent: "pi_unpaid",
            payment_status: "unpaid",
            customer: "cus_x",
          },
        },
      })
    );

    expect(res.status).toBe(200);
    // The fix: this branch now sets status: 'cancelled' so the lot trigger
    // subtracts the quantity. Previously it only flipped payment_status,
    // leaving the row counted toward committed_quantity_kg.
    expect(updateCalls[0].payload).toMatchObject({
      status: "cancelled",
      payment_status: "charge_failed",
    });
  });

  // -------------------------------------------------------------------------
  // AC12: post-setup card-auth probe (Task 4.3b)
  // -------------------------------------------------------------------------
  // The bag-aware commit flow now redirects buyers to Stripe-hosted setup.
  // When `checkout.session.completed` (mode=setup) arrives we (1) persist the
  // PM, (2) run probeCardAuth, (3) on failure write payment_error + send the
  // buyer an email. The settlement charge worker reads
  // `payment_error IS NULL` as the auth-OK signal, so the row stays at
  // payment_status='setup_complete' on both probe outcomes.

  it("checkout.session.completed (mode=setup) probes the card and leaves payment_error NULL on probe success", async () => {
    commitmentLookup = {
      id: "commit-ok",
      lot: { id: "lot-1", title: "Single-origin Yirgacheffe", currency: "USD" },
      buyer: { email: "buyer@example.com", contact_name: "Bo" },
    };
    mockProbeCardAuth.mockResolvedValue({ ok: true });

    const res = await POST(
      makeRequest({
        id: "evt_setup_ok",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_setup_ok",
            mode: "setup",
            setup_intent: "seti_ok",
            customer: "cus_ok",
            payment_method: "pm_ok",
          },
        },
      })
    );

    expect(res.status).toBe(200);
    expect(mockProbeCardAuth).toHaveBeenCalledWith({
      paymentMethodId: "pm_ok",
      customerId: "cus_ok",
      currency: "USD",
    });

    // Only the initial setup_complete update should fire — no failure write
    // means payment_error stays NULL (the settle-time auth-OK signal).
    const commitmentUpdates = updateCalls.filter((c) => c.table === "commitments");
    expect(commitmentUpdates).toHaveLength(1);
    expect(commitmentUpdates[0].payload).toMatchObject({
      payment_status: "setup_complete",
      stripe_payment_method_id: "pm_ok",
      stripe_setup_intent_id: "seti_ok",
    });
    expect(commitmentUpdates[0].payload.payment_error).toBeUndefined();
    expect(mockSendCardAuthFailedEmail).not.toHaveBeenCalled();
  });

  it("checkout.session.completed (mode=setup) sets payment_error and emails the buyer on probe failure", async () => {
    commitmentLookup = {
      id: "commit-fail",
      lot: { id: "lot-2", title: "Honey-process Geisha", currency: "USD" },
      buyer: { email: "buyer2@example.com", contact_name: "Pat" },
    };
    mockProbeCardAuth.mockResolvedValue({ ok: false, reason: "card_declined" });

    const res = await POST(
      makeRequest({
        id: "evt_setup_fail",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_setup_fail",
            mode: "setup",
            setup_intent: "seti_fail",
            customer: "cus_fail",
            payment_method: "pm_fail",
          },
        },
      })
    );

    expect(res.status).toBe(200);
    expect(mockProbeCardAuth).toHaveBeenCalledTimes(1);

    // Two commitments updates: the initial setup_complete write, then the
    // payment_error write on probe failure. payment_status stays at
    // setup_complete; the auth-OK gate uses payment_error IS NULL.
    const commitmentUpdates = updateCalls.filter((c) => c.table === "commitments");
    expect(commitmentUpdates).toHaveLength(2);
    expect(commitmentUpdates[0].payload).toMatchObject({
      payment_status: "setup_complete",
    });
    expect(commitmentUpdates[1].payload).toEqual({
      payment_error: "Auth probe failed: card_declined",
    });
    // The failure write must NOT downgrade status — the settlement worker
    // skips on payment_error, so the row remains "setup complete but unsafe".
    expect(commitmentUpdates[1].payload.payment_status).toBeUndefined();

    expect(mockSendCardAuthFailedEmail).toHaveBeenCalledWith({
      buyer: { email: "buyer2@example.com", contact_name: "Pat" },
      lot: { id: "lot-2", title: "Honey-process Geisha" },
      commitmentId: "commit-fail",
      failureReason: "card_declined",
    });
  });

  it("checkout.session.completed (mode=setup) falls back to getSetupIntent when session.payment_method is null", async () => {
    commitmentLookup = {
      id: "commit-fb",
      lot: { id: "lot-3", title: "Natural Bourbon", currency: "USD" },
      buyer: { email: "buyer3@example.com", contact_name: "Sam" },
    };
    mockGetSetupIntent.mockResolvedValue({
      id: "seti_fallback",
      payment_method: "pm_from_si",
    });
    mockProbeCardAuth.mockResolvedValue({ ok: true });

    const res = await POST(
      makeRequest({
        id: "evt_setup_fb",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_setup_fb",
            mode: "setup",
            setup_intent: "seti_fallback",
            customer: "cus_fb",
            payment_method: null,
          },
        },
      })
    );

    expect(res.status).toBe(200);
    expect(mockGetSetupIntent).toHaveBeenCalledWith("seti_fallback");
    expect(mockProbeCardAuth).toHaveBeenCalledWith({
      paymentMethodId: "pm_from_si",
      customerId: "cus_fb",
      currency: "USD",
    });
  });

  it("checkout.session.completed in payment mode with paid status charges and does NOT cancel", async () => {
    const res = await POST(
      makeRequest({
        id: "evt_7",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_paid",
            mode: "payment",
            payment_intent: "pi_paid",
            payment_status: "paid",
            customer: "cus_x",
          },
        },
      })
    );

    expect(res.status).toBe(200);
    expect(updateCalls[0].payload).toMatchObject({
      payment_status: "charge_succeeded",
    });
    // Critically, status must NOT be set to 'cancelled' on the happy path.
    expect(updateCalls[0].payload.status).toBeUndefined();
  });
});

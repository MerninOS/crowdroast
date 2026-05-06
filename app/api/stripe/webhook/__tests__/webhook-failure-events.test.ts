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
    // Post-update commitment lookup added by buyer-referral wiring uses
    // .maybeSingle(); resolving to null means the helper short-circuits
    // (no commitment row to look up an inviter for) which is fine for these
    // failure-path tests that don't need attribution behavior.
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
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

vi.mock("@/lib/stripe", () => ({
  verifyStripeWebhookSignature: vi.fn(() => true),
  getPaymentIntent: vi.fn().mockResolvedValue({ latest_charge: null }),
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

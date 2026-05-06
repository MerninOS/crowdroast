import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  settleAttributionIfPending,
  REFERRAL_CREDIT_AMOUNT_CENTS,
} from "../settle-attribution";

type Result = { data: unknown; error: unknown };

let attributionResult: Result = { data: null, error: null };
let updateResult: Result = { data: null, error: null };
let insertResult: Result = { data: null, error: null };
const updateCalls: Array<{ payload: Record<string, unknown> }> = [];
const insertCalls: Array<Record<string, unknown>> = [];

function makeMockAdmin() {
  return {
    from(table: string) {
      if (table === "referral_attributions") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => attributionResult }),
          }),
          update: (payload: Record<string, unknown>) => {
            updateCalls.push({ payload });
            return {
              eq: () => ({
                eq: () => Promise.resolve(updateResult),
              }),
            };
          },
        };
      }
      if (table === "credit_ledger") {
        return {
          insert: (payload: Record<string, unknown>) => {
            insertCalls.push(payload);
            return Promise.resolve(insertResult);
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

beforeEach(() => {
  attributionResult = { data: null, error: null };
  updateResult = { data: null, error: null };
  insertResult = { data: null, error: null };
  updateCalls.length = 0;
  insertCalls.length = 0;
});

describe("settleAttributionIfPending", () => {
  it("no-op when commitmentId is empty", async () => {
    const result = await settleAttributionIfPending(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeMockAdmin() as any,
      ""
    );
    expect(result.earned).toBe(false);
    expect(result.reason).toBe("missing_commitment_id");
  });

  it("no-op when no attribution row exists for the commitment", async () => {
    attributionResult = { data: null, error: null };
    const result = await settleAttributionIfPending(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeMockAdmin() as any,
      "c-1"
    );
    expect(result.earned).toBe(false);
    expect(result.reason).toBe("no_attribution");
    expect(insertCalls).toHaveLength(0);
  });

  it("no-op when attribution is already earned (defensive)", async () => {
    attributionResult = {
      data: {
        id: "attr-1",
        status: "earned",
        inviter_user_id: "inv-1",
        invitee_user_id: "buy-1",
        campaign_id: "ca-1",
      },
      error: null,
    };
    const result = await settleAttributionIfPending(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeMockAdmin() as any,
      "c-1"
    );
    expect(result.earned).toBe(false);
    expect(result.reason).toBe("not_pending");
    expect(updateCalls).toHaveLength(0);
    expect(insertCalls).toHaveLength(0);
  });

  it("happy path: flips to earned and inserts ledger row", async () => {
    attributionResult = {
      data: {
        id: "attr-1",
        status: "pending",
        inviter_user_id: "inv-1",
        invitee_user_id: "buy-1",
        campaign_id: "ca-1",
      },
      error: null,
    };

    const result = await settleAttributionIfPending(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeMockAdmin() as any,
      "c-1"
    );

    expect(result.earned).toBe(true);
    expect(result.inviterUserId).toBe("inv-1");
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].payload.status).toBe("earned");
    expect(updateCalls[0].payload.earned_at).toBeTruthy();

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toEqual({
      user_id: "inv-1",
      amount_cents: REFERRAL_CREDIT_AMOUNT_CENTS,
      reason: "referral_earned",
      source_attribution_id: "attr-1",
    });
  });

  it("idempotency: 23505 unique-violation on ledger insert is swallowed", async () => {
    attributionResult = {
      data: {
        id: "attr-1",
        status: "pending",
        inviter_user_id: "inv-1",
        invitee_user_id: "buy-1",
        campaign_id: "ca-1",
      },
      error: null,
    };
    insertResult = { data: null, error: { code: "23505", message: "duplicate" } };

    const result = await settleAttributionIfPending(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeMockAdmin() as any,
      "c-1"
    );

    expect(result.earned).toBe(false);
    expect(result.reason).toBe("ledger_already_recorded");
    // Update still ran on this code path; idempotency comes from the
    // WHERE status='pending' filter (the second pass updates 0 rows)
    // and the partial unique index on credit_ledger.
    expect(updateCalls).toHaveLength(1);
    expect(insertCalls).toHaveLength(1);
  });

  it("constant: REFERRAL_CREDIT_AMOUNT_CENTS is exactly $10.00", () => {
    expect(REFERRAL_CREDIT_AMOUNT_CENTS).toBe(1000);
  });
});

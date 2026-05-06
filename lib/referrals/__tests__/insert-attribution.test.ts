import { describe, it, expect, vi, beforeEach } from "vitest";
import { insertReferralAttributionIfEligible } from "../insert-attribution";

type Result = { data: unknown; error: unknown };

let commitmentResult: Result = { data: null, error: null };
let profileResult: Result = { data: null, error: null };
let existingAttributionResult: Result = { data: null, error: null };
let insertResult: Result = { data: null, error: null };
const insertCalls: Array<Record<string, unknown>> = [];

function makeMockAdmin() {
  return {
    from(table: string) {
      if (table === "commitments") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => commitmentResult }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => profileResult }),
          }),
        };
      }
      if (table === "referral_attributions") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => existingAttributionResult }),
          }),
          insert: (payload: Record<string, unknown>) => {
            insertCalls.push(payload);
            return Promise.resolve(insertResult) as unknown as Promise<Result> & {
              error: unknown;
            };
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

beforeEach(() => {
  commitmentResult = { data: null, error: null };
  profileResult = { data: null, error: null };
  existingAttributionResult = { data: null, error: null };
  insertResult = { data: null, error: null };
  insertCalls.length = 0;
});

describe("insertReferralAttributionIfEligible", () => {
  it("no-op when commitmentId is empty", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await insertReferralAttributionIfEligible(makeMockAdmin() as any, "");
    expect(result.inserted).toBe(false);
    expect(result.reason).toBe("missing_commitment_id");
    expect(insertCalls).toHaveLength(0);
  });

  it("no-op when commitment not yet charge_succeeded", async () => {
    commitmentResult = {
      data: { id: "c-1", buyer_id: "b-1", campaign_id: "ca-1", payment_status: "setup_complete" },
      error: null,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await insertReferralAttributionIfEligible(makeMockAdmin() as any, "c-1");
    expect(result.inserted).toBe(false);
    expect(result.reason).toBe("not_charge_succeeded");
    expect(insertCalls).toHaveLength(0);
  });

  it("no-op when buyer has no inviter", async () => {
    commitmentResult = {
      data: { id: "c-1", buyer_id: "b-1", campaign_id: "ca-1", payment_status: "charge_succeeded" },
      error: null,
    };
    profileResult = { data: { invited_by_user_id: null }, error: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await insertReferralAttributionIfEligible(makeMockAdmin() as any, "c-1");
    expect(result.inserted).toBe(false);
    expect(result.reason).toBe("no_inviter");
    expect(insertCalls).toHaveLength(0);
  });

  it("no-op when invitee already has an attribution (criterion 13 lock)", async () => {
    commitmentResult = {
      data: { id: "c-2", buyer_id: "b-1", campaign_id: "ca-1", payment_status: "charge_succeeded" },
      error: null,
    };
    profileResult = { data: { invited_by_user_id: "inv-1" }, error: null };
    existingAttributionResult = { data: { id: "attr-existing" }, error: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await insertReferralAttributionIfEligible(makeMockAdmin() as any, "c-2");
    expect(result.inserted).toBe(false);
    expect(result.reason).toBe("already_attributed");
    expect(insertCalls).toHaveLength(0);
  });

  it("inserts pending attribution on first eligible charge_succeeded", async () => {
    commitmentResult = {
      data: { id: "c-1", buyer_id: "b-1", campaign_id: "ca-1", payment_status: "charge_succeeded" },
      error: null,
    };
    profileResult = { data: { invited_by_user_id: "inv-1" }, error: null };
    existingAttributionResult = { data: null, error: null };
    insertResult = { data: null, error: null };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await insertReferralAttributionIfEligible(makeMockAdmin() as any, "c-1");
    expect(result.inserted).toBe(true);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toEqual({
      inviter_user_id: "inv-1",
      invitee_user_id: "b-1",
      commitment_id: "c-1",
      campaign_id: "ca-1",
      status: "pending",
    });
  });

  it("swallows 23505 race-loss as a benign no-op", async () => {
    commitmentResult = {
      data: { id: "c-1", buyer_id: "b-1", campaign_id: "ca-1", payment_status: "charge_succeeded" },
      error: null,
    };
    profileResult = { data: { invited_by_user_id: "inv-1" }, error: null };
    existingAttributionResult = { data: null, error: null };
    insertResult = { data: null, error: { code: "23505", message: "duplicate" } };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await insertReferralAttributionIfEligible(makeMockAdmin() as any, "c-1");
    expect(result.inserted).toBe(false);
    expect(result.reason).toBe("race_lost");
  });
});

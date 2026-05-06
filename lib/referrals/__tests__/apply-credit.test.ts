import { describe, it, expect, vi, beforeEach } from "vitest";
import { applyInviterCreditOnSettle } from "../apply-credit";

let balanceResult: { data: unknown; error: unknown } = { data: 0, error: null };
let insertResult: { data: unknown; error: unknown } = { data: null, error: null };
let priorDebitResult: { data: unknown; error: unknown } = { data: null, error: null };
const insertCalls: Array<Record<string, unknown>> = [];

function makeMockAdmin() {
  return {
    rpc: vi.fn(async () => balanceResult),
    from(table: string) {
      if (table === "credit_ledger") {
        return {
          insert: (payload: Record<string, unknown>) => {
            insertCalls.push(payload);
            return Promise.resolve(insertResult);
          },
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => priorDebitResult,
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

beforeEach(() => {
  balanceResult = { data: 0, error: null };
  insertResult = { data: null, error: null };
  priorDebitResult = { data: null, error: null };
  insertCalls.length = 0;
});

describe("applyInviterCreditOnSettle", () => {
  it("no-op when commitmentId is empty", async () => {
    const res = await applyInviterCreditOnSettle(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeMockAdmin() as any,
      { commitmentId: "", buyerId: "b-1", platformAmountCents: 5000 }
    );
    expect(res.applied).toBe(0);
    expect(res.adjustedPlatformAmountCents).toBe(5000);
    expect(insertCalls).toHaveLength(0);
  });

  it("no-op when platformAmount is 0 (Mernin floor protected)", async () => {
    balanceResult = { data: 1000, error: null };
    const res = await applyInviterCreditOnSettle(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeMockAdmin() as any,
      { commitmentId: "c-1", buyerId: "b-1", platformAmountCents: 0 }
    );
    expect(res.applied).toBe(0);
    expect(res.adjustedPlatformAmountCents).toBe(0);
    expect(insertCalls).toHaveLength(0);
  });

  it("no-op when balance is 0 (no ledger row inserted)", async () => {
    balanceResult = { data: 0, error: null };
    const res = await applyInviterCreditOnSettle(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeMockAdmin() as any,
      { commitmentId: "c-1", buyerId: "b-1", platformAmountCents: 5000 }
    );
    expect(res.applied).toBe(0);
    expect(res.adjustedPlatformAmountCents).toBe(5000);
    expect(insertCalls).toHaveLength(0);
  });

  it("under-cap (criterion 9): applies full balance, debits ledger, reduces platform amount", async () => {
    balanceResult = { data: 3000, error: null };
    const res = await applyInviterCreditOnSettle(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeMockAdmin() as any,
      { commitmentId: "c-1", buyerId: "b-1", platformAmountCents: 5000 }
    );
    expect(res.applied).toBe(3000);
    expect(res.adjustedPlatformAmountCents).toBe(2000); // 5000 - 3000
    expect(res.ledgerRowInserted).toBe(true);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toEqual({
      user_id: "b-1",
      amount_cents: -3000,
      reason: "commit_applied",
      source_commitment_id: "c-1",
    });
  });

  it("over-cap (criterion 10, partial OK): applies platformAmount, leaves rest in balance", async () => {
    balanceResult = { data: 3000, error: null };
    const res = await applyInviterCreditOnSettle(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeMockAdmin() as any,
      { commitmentId: "c-1", buyerId: "b-1", platformAmountCents: 1800 }
    );
    expect(res.applied).toBe(1800);
    expect(res.adjustedPlatformAmountCents).toBe(0); // floor at 0
    // Rest stays in balance for next commit; that's a balance-side fact,
    // verified by the constant: applied = min(balance, platform).
    expect(insertCalls[0].amount_cents).toBe(-1800);
  });

  it("idempotency: 23505 collision reads back prior debit and reports consistent math", async () => {
    balanceResult = { data: 5000, error: null };
    insertResult = { data: null, error: { code: "23505", message: "duplicate" } };
    priorDebitResult = { data: { amount_cents: -2000 }, error: null };

    const res = await applyInviterCreditOnSettle(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeMockAdmin() as any,
      { commitmentId: "c-1", buyerId: "b-1", platformAmountCents: 5000 }
    );

    // The prior pass applied 2000; we honor that on retry.
    expect(res.applied).toBe(2000);
    expect(res.adjustedPlatformAmountCents).toBe(3000); // 5000 - 2000
    expect(res.ledgerRowInserted).toBe(false);
  });

  it("non-23505 db error: bail safely, don't reduce platform amount", async () => {
    balanceResult = { data: 5000, error: null };
    insertResult = { data: null, error: { code: "other", message: "boom" } };

    const res = await applyInviterCreditOnSettle(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeMockAdmin() as any,
      { commitmentId: "c-1", buyerId: "b-1", platformAmountCents: 5000 }
    );

    expect(res.applied).toBe(0);
    expect(res.adjustedPlatformAmountCents).toBe(5000);
  });

  it("amount_cents inserted equals (platform before) - (platform after)", async () => {
    // Criterion 10 false-positive guard: invariant about the relationship
    // between ledger debit and adjusted platform amount.
    balanceResult = { data: 4000, error: null };
    const res = await applyInviterCreditOnSettle(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeMockAdmin() as any,
      { commitmentId: "c-1", buyerId: "b-1", platformAmountCents: 7500 }
    );
    const insertedAbs = Math.abs(insertCalls[0].amount_cents as number);
    expect(insertedAbs).toBe(7500 - res.adjustedPlatformAmountCents);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { voidAttributionsForCampaign } from "../void-attribution";

type Result = { data: unknown; error: unknown };

let updateResult: Result = { data: [], error: null };
const updateCalls: Array<{
  payload: Record<string, unknown>;
  filters: Array<[string, unknown]>;
}> = [];
const ledgerInsertCalls: Array<unknown> = [];

function makeMockAdmin() {
  return {
    from(table: string) {
      if (table === "referral_attributions") {
        const filters: Array<[string, unknown]> = [];
        let payload: Record<string, unknown> = {};
        const chain = {
          update(p: Record<string, unknown>) {
            payload = p;
            return chain;
          },
          eq(col: string, val: unknown) {
            filters.push([col, val]);
            return chain;
          },
          select() {
            updateCalls.push({ payload, filters: [...filters] });
            return Promise.resolve(updateResult);
          },
        };
        return chain;
      }
      if (table === "credit_ledger") {
        return {
          insert: (p: unknown) => {
            ledgerInsertCalls.push(p);
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

beforeEach(() => {
  updateResult = { data: [], error: null };
  updateCalls.length = 0;
  ledgerInsertCalls.length = 0;
});

describe("voidAttributionsForCampaign", () => {
  it("no-op when campaignId is empty", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await voidAttributionsForCampaign(makeMockAdmin() as any, "");
    expect(res.voided).toBe(0);
    expect(updateCalls).toHaveLength(0);
    expect(ledgerInsertCalls).toHaveLength(0);
  });

  it("voids only pending rows; does not touch earned (filter on status='pending')", async () => {
    updateResult = { data: [{ id: "attr-pending-1" }, { id: "attr-pending-2" }], error: null };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await voidAttributionsForCampaign(makeMockAdmin() as any, "ca-1");

    expect(res.voided).toBe(2);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].payload).toEqual({ status: "voided" });
    // Both filters present: campaign_id and status='pending'.
    expect(updateCalls[0].filters).toEqual(
      expect.arrayContaining([
        ["campaign_id", "ca-1"],
        ["status", "pending"],
      ])
    );
  });

  it("never inserts a credit_ledger row (criterion 8: void writes no money)", async () => {
    updateResult = { data: [{ id: "attr-1" }], error: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await voidAttributionsForCampaign(makeMockAdmin() as any, "ca-1");
    expect(ledgerInsertCalls).toHaveLength(0);
  });

  it("returns voided=0 when nothing was pending", async () => {
    updateResult = { data: [], error: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await voidAttributionsForCampaign(makeMockAdmin() as any, "ca-1");
    expect(res.voided).toBe(0);
  });

  it("returns voided=0 on db error (does not throw)", async () => {
    updateResult = { data: null, error: { message: "boom" } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await voidAttributionsForCampaign(makeMockAdmin() as any, "ca-1");
    expect(res.voided).toBe(0);
  });
});

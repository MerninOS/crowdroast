/**
 * Tests for `transferOutBagIfReady` (lib/bag-transfer-out.ts).
 *
 * Covers:
 *   1. `'not_ready'`    — at least one sibling row is non-terminal
 *   2. `'already_done'` — bag_transfers row's seller + hub legs both complete
 *   3. `'transferred'`  — happy path: split math, source_transaction on
 *                         single-row bags, fresh attempt-suffixed key,
 *                         ledger UPSERT
 *   4. `'skipped'`      — missing Connect account / hub_id unresolved
 *   5. Retry behavior   — seller-leg failure UPSERTs a retry-needed row;
 *                         a subsequent run skips the done leg and retries
 *                         the pending one with an incremented attempt_count
 *
 * Strategy: in-memory Supabase chain stub pre-staged with a queue of
 * responses keyed by `.from(table)` call order. Stripe + getPaymentIntent
 * are injected via the `deps` parameter.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  transferOutBagIfReady,
  type TransferOutBagDeps,
} from "@/lib/bag-transfer-out";

// -------------------------------------------------------------------------
// Supabase chain stub
// -------------------------------------------------------------------------

type CapturedWrite = {
  table: string;
  op: "insert" | "upsert";
  payload: Record<string, unknown>;
};
type SelectResponse = { data: unknown; error: unknown };

const writeCaptured: CapturedWrite[] = [];
const fromQueue: Array<() => Record<string, unknown>> = [];
let currentTable: string | null = null;

function makeChain(response: SelectResponse) {
  const tableNow = currentTable!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    insert: vi.fn((p: Record<string, unknown>) => {
      writeCaptured.push({ table: tableNow, op: "insert", payload: p });
      return chain;
    }),
    upsert: vi.fn((p: Record<string, unknown>) => {
      writeCaptured.push({ table: tableNow, op: "upsert", payload: p });
      return chain;
    }),
    maybeSingle: vi.fn(() => Promise.resolve(response)),
    single: vi.fn(() => Promise.resolve(response)),
    then: (resolve: (v: unknown) => void) =>
      Promise.resolve(response).then(resolve),
  };
  return chain;
}

function enqueue(table: string, response: SelectResponse) {
  fromQueue.push(() => {
    currentTable = table;
    return makeChain(response);
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeSupabase(): any {
  return {
    from: vi.fn((table: string) => {
      const next = fromQueue.shift();
      if (!next) throw new Error(`Unexpected from(${table}) — queue empty`);
      return next();
    }),
  };
}

// -------------------------------------------------------------------------
// Fixtures
// -------------------------------------------------------------------------

const FIXED_NOW = new Date("2026-05-13T12:00:00.000Z");

function defaultCommitmentJoin(overrides: Record<string, unknown> = {}) {
  return {
    lot_id: "lot-1",
    campaign_id: "camp-1",
    hub_id: "hub-1",
    lot: {
      id: "lot-1",
      seller_id: "seller-1",
      currency: "USD",
      price_per_kg: 10,
      committed_quantity_kg: 100,
      bag_size_kg: 60,
      seller_profile: { stripe_connect_account_id: "acct_seller_1" },
    },
    campaign: {
      id: "camp-1",
      hub_id: "hub-1",
      hub: { owner_profile: { stripe_connect_account_id: "acct_hub_1" } },
    },
    ...overrides,
  };
}

function makeDeps(
  stripeImpl: TransferOutBagDeps["createBagTransfer"],
  piImpl?: TransferOutBagDeps["getPaymentIntent"]
): TransferOutBagDeps {
  return {
    createBagTransfer: stripeImpl,
    getPaymentIntent:
      piImpl ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vi.fn(async () => ({ latest_charge: "ch_default" })) as any),
    now: () => FIXED_NOW,
  };
}

function bagTransfersFinder() {
  return writeCaptured.find((w) => w.table === "bag_transfers");
}

beforeEach(() => {
  writeCaptured.length = 0;
  fromQueue.length = 0;
  currentTable = null;
});

// -------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------

describe("transferOutBagIfReady", () => {
  it("returns 'not_ready' when at least one sibling row is still awaiting_charge", async () => {
    enqueue("commitments", { data: defaultCommitmentJoin(), error: null });
    enqueue("bag_transfers", { data: null, error: null });
    enqueue("commitment_bag_charges", {
      data: [
        { amount_cents: 11000, kg: 10, payment_status: "charged", stripe_payment_intent_id: "pi_a" },
        { amount_cents: 11000, kg: 10, payment_status: "awaiting_charge", stripe_payment_intent_id: null },
      ],
      error: null,
    });

    const transferMock = vi.fn();
    const result = await transferOutBagIfReady(
      makeSupabase(),
      { commitmentId: "commit-1", bagNumber: 1 },
      makeDeps(transferMock)
    );

    expect(result.status).toBe("not_ready");
    expect(transferMock).not.toHaveBeenCalled();
    expect(writeCaptured).toHaveLength(0);
  });

  it("returns 'already_done' when the bag_transfers row's seller + hub legs are both complete", async () => {
    enqueue("commitments", { data: defaultCommitmentJoin(), error: null });
    enqueue("bag_transfers", {
      data: {
        attempt_count: 1,
        seller_amount_cents: 20000,
        hub_amount_cents: 440,
        seller_transfer_id: "tr_seller_done",
        hub_transfer_id: "tr_hub_done",
        failed_reason: null,
      },
      error: null,
    });

    const transferMock = vi.fn();
    const result = await transferOutBagIfReady(
      makeSupabase(),
      { commitmentId: "commit-1", bagNumber: 1 },
      makeDeps(transferMock)
    );

    expect(result.status).toBe("already_done");
    expect(transferMock).not.toHaveBeenCalled();
  });

  it("treats the zero-amount sentinel row as already_done", async () => {
    enqueue("commitments", { data: defaultCommitmentJoin(), error: null });
    enqueue("bag_transfers", {
      data: {
        attempt_count: 1,
        seller_amount_cents: 0,
        hub_amount_cents: 0,
        seller_transfer_id: null,
        hub_transfer_id: null,
        failed_reason: null,
      },
      error: null,
    });

    const result = await transferOutBagIfReady(
      makeSupabase(),
      { commitmentId: "commit-1", bagNumber: 1 },
      makeDeps(vi.fn())
    );
    expect(result.status).toBe("already_done");
  });

  it("single-row bag: resolves source_transaction from the row's PI and fires both transfers with attempt 1", async () => {
    enqueue("commitments", { data: defaultCommitmentJoin(), error: null });
    enqueue("bag_transfers", { data: null, error: null }); // no existing row
    enqueue("commitment_bag_charges", {
      data: [
        {
          amount_cents: 99000,
          kg: 60,
          payment_status: "charged",
          stripe_payment_intent_id: "pi_single",
        },
      ],
      error: null,
    });
    enqueue("bag_transfers", { data: null, error: null }); // success upsert

    const transferMock = vi
      .fn()
      .mockImplementationOnce(async () => ({ id: "tr_seller_s" }))
      .mockImplementationOnce(async () => ({ id: "tr_hub_s" }));
    const getPIMock = vi.fn(async () => ({ latest_charge: "ch_single_99" }));

    const result = await transferOutBagIfReady(
      makeSupabase(),
      { commitmentId: "commit-1", bagNumber: 1 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeDeps(transferMock, getPIMock as any)
    );

    expect(result.status).toBe("transferred");
    // PI → latest_charge resolution happened for the single-row bag.
    expect(getPIMock).toHaveBeenCalledWith("pi_single");
    // 99000 buyer cents → seller round(99000/1.10)=90000, hub floor(99000×0.02)=1980.
    expect(transferMock).toHaveBeenNthCalledWith(1, {
      amountCents: 90000,
      currency: "usd",
      destinationAccountId: "acct_seller_1",
      lotId: "lot-1",
      bagNumber: 1,
      role: "seller",
      sourceChargeId: "ch_single_99",
      attemptNumber: 1,
    });
    expect(transferMock).toHaveBeenNthCalledWith(2, {
      amountCents: 1980,
      currency: "usd",
      destinationAccountId: "acct_hub_1",
      lotId: "lot-1",
      bagNumber: 1,
      role: "hub",
      sourceChargeId: "ch_single_99",
      attemptNumber: 1,
    });
    const write = bagTransfersFinder();
    expect(write?.op).toBe("upsert");
    expect(write?.payload).toMatchObject({
      lot_id: "lot-1",
      bag_number: 1,
      seller_amount_cents: 90000,
      hub_amount_cents: 1980,
      seller_transfer_id: "tr_seller_s",
      hub_transfer_id: "tr_hub_s",
      attempt_count: 1,
      failed_reason: null,
    });
  });

  it("multi-row bag: does NOT use source_transaction (aggregate transfer from platform balance)", async () => {
    enqueue("commitments", { data: defaultCommitmentJoin(), error: null });
    enqueue("bag_transfers", { data: null, error: null });
    enqueue("commitment_bag_charges", {
      data: [
        { amount_cents: 11000, kg: 10, payment_status: "charged", stripe_payment_intent_id: "pi_x" },
        { amount_cents: 11000, kg: 10, payment_status: "charged", stripe_payment_intent_id: "pi_y" },
      ],
      error: null,
    });
    enqueue("bag_transfers", { data: null, error: null });

    const transferMock = vi
      .fn()
      .mockImplementationOnce(async () => ({ id: "tr_seller_m" }))
      .mockImplementationOnce(async () => ({ id: "tr_hub_m" }));
    const getPIMock = vi.fn();

    const result = await transferOutBagIfReady(
      makeSupabase(),
      { commitmentId: "commit-1", bagNumber: 1 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeDeps(transferMock, getPIMock as any)
    );

    expect(result.status).toBe("transferred");
    // Multi-row → no PI resolution, sourceChargeId omitted/null.
    expect(getPIMock).not.toHaveBeenCalled();
    expect(transferMock).toHaveBeenNthCalledWith(1, {
      amountCents: 20000,
      currency: "usd",
      destinationAccountId: "acct_seller_1",
      lotId: "lot-1",
      bagNumber: 1,
      role: "seller",
      sourceChargeId: null,
      attemptNumber: 1,
    });
  });

  it("returns 'skipped' when seller has no Stripe Connect account", async () => {
    enqueue("commitments", {
      data: defaultCommitmentJoin({
        lot: {
          id: "lot-1",
          seller_id: "seller-1",
          currency: "USD",
          price_per_kg: 10,
          committed_quantity_kg: 100,
          bag_size_kg: 60,
          seller_profile: { stripe_connect_account_id: null },
        },
      }),
      error: null,
    });

    const transferMock = vi.fn();
    const result = await transferOutBagIfReady(
      makeSupabase(),
      { commitmentId: "commit-1", bagNumber: 1 },
      makeDeps(transferMock)
    );

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("seller_missing_connect_account");
    expect(transferMock).not.toHaveBeenCalled();
  });

  it("computes split correctly with irrational prices and uneven kg without going negative", async () => {
    enqueue("commitments", { data: defaultCommitmentJoin(), error: null });
    enqueue("bag_transfers", { data: null, error: null });
    enqueue("commitment_bag_charges", {
      data: [
        { amount_cents: 3667, kg: 3.333, payment_status: "charged", stripe_payment_intent_id: "pi_1" },
        { amount_cents: 3668, kg: 3.334, payment_status: "charged", stripe_payment_intent_id: "pi_2" },
        { amount_cents: 3668, kg: 3.334, payment_status: "charged", stripe_payment_intent_id: "pi_3" },
      ],
      error: null,
    });
    enqueue("bag_transfers", { data: null, error: null });

    const transferMock = vi
      .fn()
      .mockImplementationOnce(async () => ({ id: "tr_seller_irr" }))
      .mockImplementationOnce(async () => ({ id: "tr_hub_irr" }));

    const result = await transferOutBagIfReady(
      makeSupabase(),
      { commitmentId: "commit-1", bagNumber: 7 },
      makeDeps(transferMock)
    );

    expect(result.status).toBe("transferred");
    const amounts = result.amounts!;
    expect(amounts.totalChargedCents).toBe(11003);
    expect(amounts.sellerCents).toBe(10004);
    expect(amounts.hubCents).toBe(220);
    expect(amounts.platformCents).toBe(779);
    expect(amounts.platformCents).toBeGreaterThanOrEqual(0);
    expect(
      amounts.sellerCents + amounts.hubCents + amounts.platformCents
    ).toBe(amounts.totalChargedCents);
  });

  it("upserts a zero-amount bag_transfers row when every sibling is payment_failed", async () => {
    enqueue("commitments", { data: defaultCommitmentJoin(), error: null });
    enqueue("bag_transfers", { data: null, error: null });
    enqueue("commitment_bag_charges", {
      data: [
        { amount_cents: 11000, kg: 10, payment_status: "payment_failed", stripe_payment_intent_id: null },
        { amount_cents: 11000, kg: 10, payment_status: "payment_failed", stripe_payment_intent_id: null },
      ],
      error: null,
    });
    enqueue("bag_transfers", { data: null, error: null });

    const transferMock = vi.fn();
    const result = await transferOutBagIfReady(
      makeSupabase(),
      { commitmentId: "commit-1", bagNumber: 1 },
      makeDeps(transferMock)
    );

    expect(result.status).toBe("transferred");
    expect(result.reason).toBe("all_rows_failed_no_money_to_move");
    expect(transferMock).not.toHaveBeenCalled();
    const write = bagTransfersFinder();
    expect(write?.op).toBe("upsert");
    expect(write?.payload).toMatchObject({
      seller_amount_cents: 0,
      hub_amount_cents: 0,
      platform_amount_cents: 0,
      seller_transfer_id: null,
      hub_transfer_id: null,
      attempt_count: 1,
      failed_reason: null,
    });
  });

  it("returns 'skipped' when neither campaign.hub_id nor commitment.hub_id is resolvable", async () => {
    enqueue("commitments", {
      data: defaultCommitmentJoin({
        hub_id: null,
        campaign: {
          id: "camp-1",
          hub_id: null,
          hub: { owner_profile: { stripe_connect_account_id: "acct_hub_1" } },
        },
      }),
      error: null,
    });

    const transferMock = vi.fn();
    const result = await transferOutBagIfReady(
      makeSupabase(),
      { commitmentId: "commit-1", bagNumber: 1 },
      makeDeps(transferMock)
    );

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("hub_id_unresolved_on_commitment");
    expect(transferMock).not.toHaveBeenCalled();
    expect(writeCaptured).toHaveLength(0);
  });

  // ------------------------------------------------------------------
  // Retry behavior
  // ------------------------------------------------------------------

  it("seller transfer failure UPSERTs a retry-needed row (attempt 1, failed_reason set) and returns skipped", async () => {
    enqueue("commitments", { data: defaultCommitmentJoin(), error: null });
    enqueue("bag_transfers", { data: null, error: null }); // no existing row
    enqueue("commitment_bag_charges", {
      data: [
        {
          amount_cents: 99000,
          kg: 60,
          payment_status: "charged",
          stripe_payment_intent_id: "pi_fail",
        },
      ],
      error: null,
    });
    enqueue("bag_transfers", { data: null, error: null }); // failure upsert

    const transferMock = vi.fn(async () => {
      throw new Error(
        "You have insufficient available funds in your Stripe account."
      );
    });

    const result = await transferOutBagIfReady(
      makeSupabase(),
      { commitmentId: "commit-1", bagNumber: 2 },
      makeDeps(transferMock)
    );

    expect(result.status).toBe("skipped");
    expect(result.reason).toContain("seller_transfer_failed");
    expect(result.reason).toContain("insufficient available funds");
    const write = bagTransfersFinder();
    expect(write?.op).toBe("upsert");
    expect(write?.payload).toMatchObject({
      lot_id: "lot-1",
      bag_number: 2,
      seller_amount_cents: 90000,
      seller_transfer_id: null,
      hub_transfer_id: null,
      attempt_count: 1,
    });
    expect(write?.payload.failed_reason).toContain("seller_transfer_failed");
  });

  it("on a retry with an existing seller-done/hub-pending row: skips the seller leg, retries hub with attempt_count+1", async () => {
    enqueue("commitments", { data: defaultCommitmentJoin(), error: null });
    // Existing partial row: seller leg done on attempt 1, hub leg failed.
    enqueue("bag_transfers", {
      data: {
        attempt_count: 1,
        seller_amount_cents: 90000,
        hub_amount_cents: 1980,
        seller_transfer_id: "tr_seller_prev",
        hub_transfer_id: null,
        failed_reason: "hub_transfer_failed: insufficient available funds",
      },
      error: null,
    });
    enqueue("commitment_bag_charges", {
      data: [
        {
          amount_cents: 99000,
          kg: 60,
          payment_status: "charged",
          stripe_payment_intent_id: "pi_retry",
        },
      ],
      error: null,
    });
    enqueue("bag_transfers", { data: null, error: null }); // success upsert

    // Only the hub transfer should be attempted this run.
    const transferMock = vi.fn(async () => ({ id: "tr_hub_retry_ok" }));

    const result = await transferOutBagIfReady(
      makeSupabase(),
      { commitmentId: "commit-1", bagNumber: 3 },
      makeDeps(transferMock)
    );

    expect(result.status).toBe("transferred");
    // Seller leg skipped — only one Stripe call (the hub retry).
    expect(transferMock).toHaveBeenCalledTimes(1);
    expect(transferMock).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "hub",
        // attempt_count was 1, so this retry is attempt 2 → fresh key.
        attemptNumber: 2,
      })
    );
    // Final ledger row carries BOTH transfer ids (seller from the prior
    // attempt, hub from this one) and clears failed_reason.
    const write = bagTransfersFinder();
    expect(write?.payload).toMatchObject({
      seller_transfer_id: "tr_seller_prev",
      hub_transfer_id: "tr_hub_retry_ok",
      attempt_count: 2,
      failed_reason: null,
    });
  });

  it("falls back to general-balance transfer (no source) when getPaymentIntent throws", async () => {
    enqueue("commitments", { data: defaultCommitmentJoin(), error: null });
    enqueue("bag_transfers", { data: null, error: null });
    enqueue("commitment_bag_charges", {
      data: [
        {
          amount_cents: 99000,
          kg: 60,
          payment_status: "charged",
          stripe_payment_intent_id: "pi_blip",
        },
      ],
      error: null,
    });
    enqueue("bag_transfers", { data: null, error: null });

    const transferMock = vi
      .fn()
      .mockImplementationOnce(async () => ({ id: "tr_s" }))
      .mockImplementationOnce(async () => ({ id: "tr_h" }));
    const getPIMock = vi.fn(async () => {
      throw new Error("stripe timeout");
    });

    const result = await transferOutBagIfReady(
      makeSupabase(),
      { commitmentId: "commit-1", bagNumber: 1 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeDeps(transferMock, getPIMock as any)
    );

    expect(result.status).toBe("transferred");
    // sourceChargeId resolves to null on the blip → still fires (legacy
    // general-balance path), retry sweep covers it if it fails.
    expect(transferMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ role: "seller", sourceChargeId: null })
    );
  });
});

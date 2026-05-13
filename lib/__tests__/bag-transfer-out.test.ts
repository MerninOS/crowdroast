/**
 * Tests for `transferOutBagIfReady` (lib/bag-transfer-out.ts) — Task 4.11.
 *
 * Covers the three documented return paths:
 *   1. `'not_ready'`   — at least one sibling row is non-terminal
 *   2. `'already_done'` — `bag_transfers` already has the (lot, bag) row
 *   3. `'transferred'` — happy path: split math, two Stripe calls, ledger row
 *
 * Strategy: same in-memory Supabase chain stub as `charge-worker.test.ts`,
 * pre-staged with a queue of responses keyed by the `.from(table)` call
 * order. The Stripe transfer function is injected via the `deps` parameter.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  transferOutBagIfReady,
  type TransferOutBagDeps,
} from "@/lib/bag-transfer-out";

// -------------------------------------------------------------------------
// Supabase chain stub.
// -------------------------------------------------------------------------
// Each `from(table)` call dequeues the next pre-staged response. The chain
// captures INSERT payloads so the happy-path test can assert the recorded
// ledger row.

type CapturedInsert = {
  table: string;
  payload: Record<string, unknown>;
};
type SelectResponse = {
  data: unknown;
  error: unknown;
};

const insertCaptured: CapturedInsert[] = [];
const fromQueue: Array<() => Record<string, unknown>> = [];
let currentTable: string | null = null;

function makeChain(response: SelectResponse) {
  let pendingInsertPayload: Record<string, unknown> | null = null;
  const tableNow = currentTable!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    insert: vi.fn((p: Record<string, unknown>) => {
      pendingInsertPayload = p;
      // INSERT terminates the chain on its own (no .select() needed); the
      // stub resolves it via `then`. Capture immediately so the assertion
      // runs even if the test never awaits the chain.
      insertCaptured.push({ table: tableNow, payload: p });
      return chain;
    }),
    maybeSingle: vi.fn(() => Promise.resolve(response)),
    single: vi.fn(() => Promise.resolve(response)),
    then: (resolve: (v: unknown) => void) => {
      // Plain awaited UPDATE/INSERT without .select()/.single().
      void pendingInsertPayload;
      return Promise.resolve(response).then(resolve);
    },
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
      if (!next) {
        throw new Error(`Unexpected from(${table}) — queue empty`);
      }
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
      hub: {
        owner_profile: { stripe_connect_account_id: "acct_hub_1" },
      },
    },
    ...overrides,
  };
}

function makeDeps(
  stripeImpl: TransferOutBagDeps["createBagTransfer"]
): TransferOutBagDeps {
  return {
    createBagTransfer: stripeImpl,
    now: () => FIXED_NOW,
  };
}

beforeEach(() => {
  insertCaptured.length = 0;
  fromQueue.length = 0;
  currentTable = null;
});

// -------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------

describe("transferOutBagIfReady", () => {
  // ------------------------------------------------------------------
  // 1. not_ready: sibling rows non-terminal
  // ------------------------------------------------------------------
  it("returns 'not_ready' when at least one sibling row is still awaiting_charge", async () => {
    // commitments lookup
    enqueue("commitments", {
      data: defaultCommitmentJoin(),
      error: null,
    });
    // bag_transfers idempotency lookup → no existing row
    enqueue("bag_transfers", { data: null, error: null });
    // commitment_bag_charges sibling lookup: ONE charged + ONE awaiting
    enqueue("commitment_bag_charges", {
      data: [
        { amount_cents: 11000, kg: 10, payment_status: "charged" },
        { amount_cents: 11000, kg: 10, payment_status: "awaiting_charge" },
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
    expect(insertCaptured).toHaveLength(0);
  });

  // ------------------------------------------------------------------
  // 2. already_done: bag_transfers already has the row
  // ------------------------------------------------------------------
  it("returns 'already_done' when bag_transfers already has the (lot, bag) row", async () => {
    enqueue("commitments", {
      data: defaultCommitmentJoin(),
      error: null,
    });
    // bag_transfers lookup returns an existing row → short-circuit.
    enqueue("bag_transfers", {
      data: { lot_id: "lot-1" },
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

  // ------------------------------------------------------------------
  // 3. transferred: happy path
  // ------------------------------------------------------------------
  it("fires seller + hub transfers and inserts bag_transfers on the happy path", async () => {
    // Two charged rows summing $200 buyer-paid (after platform fee).
    // Buyer-side total cents = 20 kg × $10 × 1.10 × 100 = 22,000 cents.
    // Seller-base cents      = 20 kg × $10        × 100 = 20,000 cents.
    // Hub (2% of buyer total, capped by total − seller) = floor(22000 * 200 / 10000)
    //                                                    = 440 cents.
    // Platform keeps = 22000 − 20000 − 440 = 1,560 cents (≈ 8% of seller base).
    enqueue("commitments", {
      data: defaultCommitmentJoin(),
      error: null,
    });
    enqueue("bag_transfers", { data: null, error: null });
    enqueue("commitment_bag_charges", {
      data: [
        { amount_cents: 11000, kg: 10, payment_status: "charged" },
        { amount_cents: 11000, kg: 10, payment_status: "charged" },
      ],
      error: null,
    });
    enqueue("pricing_tiers", { data: [], error: null });
    // Final INSERT into bag_transfers.
    enqueue("bag_transfers", { data: null, error: null });

    const transferMock = vi
      .fn()
      .mockImplementationOnce(async () => ({ id: "tr_seller_123" }))
      .mockImplementationOnce(async () => ({ id: "tr_hub_456" }));

    const result = await transferOutBagIfReady(
      makeSupabase(),
      { commitmentId: "commit-1", bagNumber: 1 },
      makeDeps(transferMock)
    );

    expect(result.status).toBe("transferred");
    expect(result.amounts).toEqual({
      sellerCents: 20000,
      hubCents: 440,
      platformCents: 1560,
      totalChargedCents: 22000,
    });
    expect(result.transferIds).toEqual({
      seller: "tr_seller_123",
      hub: "tr_hub_456",
    });

    // Stripe was called twice: seller first, then hub.
    expect(transferMock).toHaveBeenCalledTimes(2);
    expect(transferMock).toHaveBeenNthCalledWith(1, {
      amountCents: 20000,
      currency: "usd",
      destinationAccountId: "acct_seller_1",
      lotId: "lot-1",
      bagNumber: 1,
      role: "seller",
    });
    expect(transferMock).toHaveBeenNthCalledWith(2, {
      amountCents: 440,
      currency: "usd",
      destinationAccountId: "acct_hub_1",
      lotId: "lot-1",
      bagNumber: 1,
      role: "hub",
    });

    // Ledger row was inserted with the split + Stripe ids stamped.
    const insert = insertCaptured.find(
      (i) => i.table === "bag_transfers"
    );
    expect(insert).toBeDefined();
    expect(insert?.payload).toMatchObject({
      lot_id: "lot-1",
      bag_number: 1,
      currency: "USD",
      seller_amount_cents: 20000,
      hub_amount_cents: 440,
      platform_amount_cents: 1560,
      seller_transfer_id: "tr_seller_123",
      hub_transfer_id: "tr_hub_456",
    });
  });

  // ------------------------------------------------------------------
  // 4. skipped: missing seller stripe account
  // ------------------------------------------------------------------
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

  // ------------------------------------------------------------------
  // 5. transferred (degenerate): all rows payment_failed → zero-money record
  // ------------------------------------------------------------------
  it("records a zero-amount bag_transfers row when every sibling is payment_failed", async () => {
    enqueue("commitments", {
      data: defaultCommitmentJoin(),
      error: null,
    });
    enqueue("bag_transfers", { data: null, error: null });
    enqueue("commitment_bag_charges", {
      data: [
        { amount_cents: 11000, kg: 10, payment_status: "payment_failed" },
        { amount_cents: 11000, kg: 10, payment_status: "payment_failed" },
      ],
      error: null,
    });
    // Final INSERT for the zero-amount ledger row.
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
    expect(insertCaptured[0]?.payload).toMatchObject({
      lot_id: "lot-1",
      bag_number: 1,
      seller_amount_cents: 0,
      hub_amount_cents: 0,
      platform_amount_cents: 0,
      seller_transfer_id: null,
      hub_transfer_id: null,
    });
  });
});

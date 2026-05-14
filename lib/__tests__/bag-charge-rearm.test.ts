/**
 * Tests for `rearmFailedBagCharges` — the helper that flips terminal
 * `payment_failed` bag rows back to `awaiting_charge` after a buyer
 * completes a fresh Stripe setup session via the restart-setup flow.
 *
 * Failure cases this guards:
 * - Re-arming a row without rotating `stripe_idempotency_key` (Stripe's
 *   cache would replay the previous decline).
 * - Re-arming rows that aren't `payment_failed` (would clobber a worker
 *   tick that's already mid-charge).
 * - Wiping non-bag-aware commits or other commits' bag rows.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { rearmFailedBagCharges } from "../bag-charge-rearm";

// Captured calls — one entry per .from(...).update(...) chain that
// resolves a .then(). Mirrors the shape used by the webhook tests so
// assertions read consistently.
const updateCalls: Array<{
  table: string;
  payload: Record<string, unknown>;
  filters: Array<{ op: string; col: string; val: unknown }>;
}> = [];

// Configurable shape for the SELECT call. Tests override this in their
// arrange step.
let selectRows: Array<{ id: string; bag_number: number }> | null = [];
let selectError: { message: string } | null = null;

// Per-row update errors keyed by row id. Default: success on every row.
let updateErrorsByRowId: Record<string, { message: string } | undefined> = {};

function makeChain(table: string) {
  let mode: "select" | "update" | null = null;
  let pendingUpdatePayload: Record<string, unknown> | null = null;
  const filters: Array<{ op: string; col: string; val: unknown }> = [];

  const chain: Record<string, unknown> = {
    select: vi.fn(() => {
      mode = "select";
      return chain;
    }),
    update: vi.fn((payload: Record<string, unknown>) => {
      mode = "update";
      pendingUpdatePayload = payload;
      return chain;
    }),
    eq: vi.fn((col: string, val: unknown) => {
      filters.push({ op: "eq", col, val });
      return chain;
    }),
    then: (resolve: (v: unknown) => void) => {
      if (mode === "select") {
        return Promise.resolve({ data: selectRows, error: selectError }).then(
          resolve
        );
      }
      if (mode === "update" && pendingUpdatePayload) {
        updateCalls.push({
          table,
          payload: pendingUpdatePayload,
          filters: [...filters],
        });
        // Look up a configured per-row error using the .eq("id", rowId) we
        // captured. Falls back to null (success) for any row that isn't
        // overridden.
        const idFilter = filters.find(
          (f) => f.op === "eq" && f.col === "id"
        );
        const rowId = (idFilter?.val as string) || "";
        const err = updateErrorsByRowId[rowId] ?? null;
        return Promise.resolve({ data: null, error: err }).then(resolve);
      }
      return Promise.resolve({ data: null, error: null }).then(resolve);
    },
  };
  return chain;
}

const supabase = {
  from: (table: string) => makeChain(table),
} as unknown as Parameters<typeof rearmFailedBagCharges>[0];

beforeEach(() => {
  updateCalls.length = 0;
  selectRows = [];
  selectError = null;
  updateErrorsByRowId = {};
});

describe("rearmFailedBagCharges", () => {
  it("returns no_failed_rows when the commitment has no payment_failed bags (happy-no-op path)", async () => {
    selectRows = [];
    const result = await rearmFailedBagCharges(supabase, {
      commitmentId: "c-1",
      newSetupIntentId: "seti_new_1",
    });
    expect(result.status).toBe("no_failed_rows");
    expect(result.rearmedRowIds).toEqual([]);
    // No UPDATE chain should have resolved.
    expect(updateCalls).toEqual([]);
  });

  it("flips a single payment_failed row to awaiting_charge with a fresh idempotency key", async () => {
    selectRows = [{ id: "bc-7", bag_number: 1 }];

    const result = await rearmFailedBagCharges(supabase, {
      commitmentId: "c-1",
      newSetupIntentId: "seti_new_1",
    });

    expect(result.status).toBe("rearmed");
    expect(result.rearmedRowIds).toEqual(["bc-7"]);

    expect(updateCalls).toHaveLength(1);
    const call = updateCalls[0];
    expect(call.table).toBe("commitment_bag_charges");
    expect(call.payload).toMatchObject({
      payment_status: "awaiting_charge",
      attempt_count: 0,
      failed_reason: null,
      next_attempt_at: null,
      stripe_payment_intent_id: null,
      payment_update_email_sent_at: null,
      // Key MUST be different from the row's original deterministic
      // settlement key — encodes the new setup_intent so Stripe's
      // idempotency cache no longer replays the prior decline.
      stripe_idempotency_key: "retry:seti_new_1:bag:1",
    });
    // Scope guard: only flip rows still in payment_failed (prevents racing
    // with a worker tick that may have re-claimed the row).
    expect(call.filters).toContainEqual({
      op: "eq",
      col: "payment_status",
      val: "payment_failed",
    });
    expect(call.filters).toContainEqual({ op: "eq", col: "id", val: "bc-7" });
  });

  it("processes every failed row and uses each row's bag_number in its new idempotency key", async () => {
    selectRows = [
      { id: "bc-1", bag_number: 1 },
      { id: "bc-2", bag_number: 2 },
      { id: "bc-3", bag_number: 3 },
    ];

    const result = await rearmFailedBagCharges(supabase, {
      commitmentId: "c-multi",
      newSetupIntentId: "seti_xyz",
    });

    expect(result.status).toBe("rearmed");
    expect(result.rearmedRowIds.sort()).toEqual(["bc-1", "bc-2", "bc-3"]);
    expect(updateCalls).toHaveLength(3);
    expect(
      updateCalls.map((c) => c.payload.stripe_idempotency_key).sort()
    ).toEqual([
      "retry:seti_xyz:bag:1",
      "retry:seti_xyz:bag:2",
      "retry:seti_xyz:bag:3",
    ]);
  });

  it("treats a failed UPDATE on one row as that row not being re-armed; other rows still go through", async () => {
    selectRows = [
      { id: "bc-good", bag_number: 1 },
      { id: "bc-raced", bag_number: 2 },
    ];
    updateErrorsByRowId = {
      "bc-raced": { message: "concurrent worker claimed the row" },
    };

    const result = await rearmFailedBagCharges(supabase, {
      commitmentId: "c-race",
      newSetupIntentId: "seti_race",
    });

    expect(result.status).toBe("rearmed");
    expect(result.rearmedRowIds).toEqual(["bc-good"]);
    expect(updateCalls).toHaveLength(2); // both attempted
  });

  it("throws when the initial SELECT errors out (callers should not silently proceed)", async () => {
    selectError = { message: "db connection reset" };
    await expect(
      rearmFailedBagCharges(supabase, {
        commitmentId: "c-x",
        newSetupIntentId: "seti_x",
      })
    ).rejects.toThrow(/db connection reset/);
  });

  it("is idempotent when the SELECT returns no rows on a second delivery (Stripe webhook retry pattern)", async () => {
    // First delivery: a row is flipped.
    selectRows = [{ id: "bc-1", bag_number: 1 }];
    const first = await rearmFailedBagCharges(supabase, {
      commitmentId: "c-idem",
      newSetupIntentId: "seti_idem",
    });
    expect(first.status).toBe("rearmed");

    // Second delivery (Stripe's at-least-once redelivery of the same
    // setup_intent.succeeded event): the row is now `awaiting_charge`,
    // so SELECT returns []; the helper short-circuits as no_failed_rows.
    selectRows = [];
    updateCalls.length = 0;
    const second = await rearmFailedBagCharges(supabase, {
      commitmentId: "c-idem",
      newSetupIntentId: "seti_idem",
    });
    expect(second.status).toBe("no_failed_rows");
    expect(updateCalls).toEqual([]);
  });
});

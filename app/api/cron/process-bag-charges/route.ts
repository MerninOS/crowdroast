import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCronRequest } from "@/lib/auth/cron-route";
import {
  processBagCharge,
  type BagChargeRow,
  type ProcessBagChargeOutcome,
} from "@/lib/charge-worker";
import { NextResponse } from "next/server";

/**
 * Bag-aware campaign close — charge worker cron (Task 4.8).
 *
 * Runs daily at 02:00 UTC (see vercel.json). settle-deadlines runs at
 * 00:00, lot-expiry at 01:00; this offset comes after both so new
 * `commitment_bag_charges` rows from the night's settlement are visible.
 *
 * Picks up rows in `awaiting_charge` or `retry_scheduled` whose
 * `next_attempt_at` is null or due, then dispatches one Stripe call per row
 * via `processBagCharge`. The worker itself records `next_attempt_at` at
 * +12h / +48h after declines per AC13's math — but because Vercel Hobby
 * caps cron frequency at daily, the actual retry tick lands at the
 * next-daily-tick-after-next_attempt_at. Effective retry ladder on
 * Hobby: attempt 1 at ~02:00 the morning after settlement, attempt 2 at
 * ~02:00 the following day (~24h gap vs. the +12h target), attempt 3
 * ~48h later (on-schedule). Upgrade to Pro to restore the original
 * `15 * * * *` (hourly) cadence and tighter ladder timing.
 *
 * Vercel Cron does not auto-retry on failure. The worker writes
 * `next_attempt_at` BEFORE flipping to `'charging'` (5-minute lease), so a
 * crashed worker self-recovers on the next tick without wedging rows.
 */

// Hard cap on rows per tick. With Vercel's 300s function limit and Stripe's
// typical 200–400ms charge latency, ~100 rows fits comfortably with margin.
// If a campaign has more rows than this, leftover rows are simply picked up
// next tick.
const BATCH_LIMIT = 100;

// Soft wall-clock cap — bail and let the next tick continue if we approach
// the Vercel 300s function timeout. Keeps the response from being killed
// mid-write.
const MAX_RUN_MS = 4 * 60 * 1000; // 4 minutes

export async function GET(request: Request) {
  const unauthorized = authorizeCronRequest(request);
  if (unauthorized) return unauthorized;

  const admin = createAdminClient();
  const runStartedAt = Date.now();
  const nowIso = new Date().toISOString();

  // Worker-queue scan. The composite index on (payment_status,
  // next_attempt_at) supports this query — see migration #38 comments.
  // NULLS FIRST ordering means brand-new rows (never attempted) are
  // processed before retries, which matches "first attempt at settlement".
  const { data: rows, error: queryError } = await admin
    .from("commitment_bag_charges")
    .select(
      "id, commitment_id, bag_number, kg, amount_cents, stripe_payment_intent_id, stripe_idempotency_key, payment_status, attempt_count, next_attempt_at, failed_reason"
    )
    // Include 'charging' so stale leases (crashed mid-Stripe-call worker)
    // get picked up on the next tick once their +5m lease window expires.
    // Stripe's deterministic idempotency_key makes a rare two-worker race safe.
    .in("payment_status", ["awaiting_charge", "retry_scheduled", "charging"])
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .order("next_attempt_at", { ascending: true, nullsFirst: true })
    .limit(BATCH_LIMIT);

  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  const counts: Record<ProcessBagChargeOutcome, number> = {
    charged: 0,
    retry_scheduled: 0,
    payment_failed: 0,
    skipped: 0,
  };
  const failedReasons: Array<{
    charge_id: string;
    outcome: ProcessBagChargeOutcome;
    reason: string;
  }> = [];

  let processed = 0;
  let bailed = false;

  for (const row of (rows || []) as BagChargeRow[]) {
    if (Date.now() - runStartedAt > MAX_RUN_MS) {
      // Approaching the function timeout — stop and let the next tick
      // continue. The remaining rows stay workable.
      bailed = true;
      break;
    }

    const result = await processBagCharge(admin, row);
    counts[result.outcome] += 1;
    processed += 1;

    if (
      (result.outcome === "payment_failed" ||
        result.outcome === "retry_scheduled" ||
        result.outcome === "skipped") &&
      result.reason
    ) {
      failedReasons.push({
        charge_id: row.id,
        outcome: result.outcome,
        reason: result.reason,
      });
    }
  }

  return NextResponse.json(
    {
      processed,
      charged: counts.charged,
      retry_scheduled: counts.retry_scheduled,
      payment_failed: counts.payment_failed,
      skipped: counts.skipped,
      bailed,
      failed_reasons: failedReasons,
    },
    // 207 (Multi-Status) when any row terminated as payment_failed — surfaces
    // partial failure to monitoring while keeping the success metrics in the
    // body.
    { status: counts.payment_failed > 0 ? 207 : 200 }
  );
}

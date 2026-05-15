import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCronRequest } from "@/lib/auth/cron-route";
import {
  processBagCharge,
  type BagChargeRow,
  type ProcessBagChargeOutcome,
} from "@/lib/charge-worker";
import { transferOutBagIfReady } from "@/lib/bag-transfer-out";
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

  // ---------------------------------------------------------------------
  // Retry sweep: re-fire transfers for bags whose charge rows are all
  // terminal but whose `bag_transfers` row is missing OR partial.
  // ---------------------------------------------------------------------
  // Without this, a transient Stripe transfer failure (e.g. platform
  // balance hasn't cleared yet → `insufficient_funds`) leaves the seller
  // unpaid forever: the per-row loop above won't pick up `charged` rows
  // again, so transferOutBagIfReady would never be re-invoked from the
  // normal charge path. The sweep finds those stuck bags and reruns the
  // helper, which now (a) UPSERTs the partial state on failure and (b)
  // uses a fresh `attempt_count`-suffixed Stripe idempotency key so
  // Stripe doesn't replay the cached failure.
  //
  // Two stuck-bag shapes both need re-driving:
  //   - No `bag_transfers` row at all. Bag had its charge rows reach
  //     terminal but transferOutBagIfReady was never reached / its
  //     UPSERT crashed before persisting. Pre-fix this PR's data — the
  //     user-reported stuck bags 2 & 3 — sit here.
  //   - Partial `bag_transfers` row. Seller leg failed, or hub leg
  //     failed after seller succeeded. Retry-needed state encoded by
  //     `seller_transfer_id IS NULL AND seller_amount_cents > 0` (or
  //     analogous for hub). Migration #46's partial index
  //     `bag_transfers_retry_needed_idx` makes the bag_transfers-side
  //     lookup cheap.
  //
  // Implementation: one scan over `commitment_bag_charges`, grouped in
  // JS by (lot_id, bag_number). For each bag, check (a) all rows are
  // terminal with at least one `charged` and (b) the bag isn't fully
  // settled in `bag_transfers` yet. Call `transferOutBagIfReady` for
  // each match. The helper is idempotent and skips already-done legs.
  let retryAttempted = 0;
  let retryTransferred = 0;
  const retrySkippedReasons: Array<{
    lot_id: string;
    bag_number: number;
    reason: string;
  }> = [];

  if (Date.now() - runStartedAt < MAX_RUN_MS) {
    type BagRow = {
      commitment_id: string;
      bag_number: number;
      payment_status: string;
      commitment: { lot_id: string };
    };

    // Pull every bag-charge row (joined to commitment.lot_id) and existing
    // bag_transfers rows in parallel. With current volume both are small;
    // a hard LIMIT keeps this safe under unexpected scale and the next
    // tick will pick up the rest.
    const [chargeRowsResult, transfersResult] = await Promise.all([
      admin
        .from("commitment_bag_charges")
        .select(
          "commitment_id, bag_number, payment_status, commitment:commitment_id!inner(lot_id)"
        )
        .limit(5000),
      admin
        .from("bag_transfers")
        .select(
          "lot_id, bag_number, seller_amount_cents, hub_amount_cents, seller_transfer_id, hub_transfer_id"
        ),
    ]);

    type BagAggregate = {
      lotId: string;
      bagNumber: number;
      sampleCommitmentId: string;
      hasCharged: boolean;
      hasNonTerminal: boolean;
    };
    const bags = new Map<string, BagAggregate>();
    for (const raw of (chargeRowsResult.data ?? []) as BagRow[]) {
      const commitment = Array.isArray(raw.commitment)
        ? raw.commitment[0]
        : raw.commitment;
      const lotId = commitment?.lot_id;
      if (!lotId) continue;
      const key = `${lotId}:${raw.bag_number}`;
      let entry = bags.get(key);
      if (!entry) {
        entry = {
          lotId,
          bagNumber: raw.bag_number,
          sampleCommitmentId: raw.commitment_id,
          hasCharged: false,
          hasNonTerminal: false,
        };
        bags.set(key, entry);
      }
      if (raw.payment_status === "charged") entry.hasCharged = true;
      if (raw.payment_status !== "charged" && raw.payment_status !== "payment_failed") {
        entry.hasNonTerminal = true;
      }
    }

    // Build the "fully done" set so we skip bags whose seller + hub legs
    // are both complete (or are the zero-amount sentinel).
    const fullyDone = new Set<string>();
    for (const row of (transfersResult.data ?? []) as Array<{
      lot_id: string;
      bag_number: number;
      seller_amount_cents: number;
      hub_amount_cents: number;
      seller_transfer_id: string | null;
      hub_transfer_id: string | null;
    }>) {
      const sellerDone =
        row.seller_transfer_id != null || row.seller_amount_cents === 0;
      const hubDone =
        row.hub_transfer_id != null || row.hub_amount_cents === 0;
      if (sellerDone && hubDone) {
        fullyDone.add(`${row.lot_id}:${row.bag_number}`);
      }
    }

    for (const [key, bag] of bags) {
      if (Date.now() - runStartedAt > MAX_RUN_MS) {
        bailed = true;
        break;
      }
      // Eligible: every sibling row terminal AND at least one charged AND
      // the bag isn't already fully settled. transferOutBagIfReady's own
      // checks would catch the rest defensively, but pre-filtering keeps
      // the per-tick worst case bounded.
      if (bag.hasNonTerminal) continue;
      if (!bag.hasCharged) continue;
      if (fullyDone.has(key)) continue;

      retryAttempted += 1;
      const result = await transferOutBagIfReady(admin, {
        commitmentId: bag.sampleCommitmentId,
        bagNumber: bag.bagNumber,
      });
      if (result.status === "transferred" || result.status === "already_done") {
        retryTransferred += 1;
      } else if (result.reason) {
        retrySkippedReasons.push({
          lot_id: bag.lotId,
          bag_number: bag.bagNumber,
          reason: result.reason,
        });
      }
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
      transfer_retries_attempted: retryAttempted,
      transfer_retries_succeeded: retryTransferred,
      transfer_retries_skipped_reasons: retrySkippedReasons,
    },
    // 207 (Multi-Status) when any row terminated as payment_failed OR a
    // transfer retry is still stuck — surfaces partial failure to
    // monitoring while keeping the success metrics in the body.
    {
      status:
        counts.payment_failed > 0 || retrySkippedReasons.length > 0
          ? 207
          : 200,
    }
  );
}

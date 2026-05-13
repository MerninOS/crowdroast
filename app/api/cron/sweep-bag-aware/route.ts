import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeCronRequest } from "@/lib/auth/cron-route";
import { transferOutBagIfReady } from "@/lib/bag-transfer-out";
import { sendSettlementEmailIfReady } from "@/lib/settlement-email-trigger";
import { NextResponse } from "next/server";

/**
 * Bag-aware campaign close — daily sweeper cron (M5 + M6 fixes).
 *
 * Runs daily at 06:30 UTC (see vercel.json). Offset from the hourly
 * charge-worker tick (`:15`) and the midnight settle-deadlines run so it
 * picks up stragglers after the last hourly worker tick of the prior day
 * has had time to finish.
 *
 * Two sweeps per invocation, both idempotent and capped:
 *
 *   1. **Stuck bag transfers (M5)** — `lib/bag-transfer-out.ts` is called
 *      fire-and-forget from the charge worker after each terminal exit. If
 *      Stripe was down at the LAST terminal-row tick for a bag, no
 *      `bag_transfers` row was inserted and the bag's money never moved.
 *      This sweep finds `(commitment_id, bag_number)` tuples where every
 *      row in `commitment_bag_charges` is terminal AND no `bag_transfers`
 *      row exists for the corresponding `(lot_id, bag_number)`, and
 *      re-invokes the transfer-out helper. The helper's own idempotency
 *      checks (PK on `bag_transfers`, Stripe idempotency keys) protect
 *      against double-pay if a worker tick races us.
 *
 *   2. **Failed settlement emails (M6)** — `lib/settlement-email-trigger.ts`
 *      stamps `settlement_email_sent_at` BEFORE the Resend call (Stripe-
 *      style claim-then-act so we never double-send). On Resend failure it
 *      also writes `settlement_email_status = 'send_failed'` (migration
 *      #42). This sweep finds those rows, clears BOTH columns, and re-
 *      invokes the trigger. The trigger's atomic stamp re-claim prevents
 *      duplicate sends if a worker races the sweeper.
 *
 * Both sweeps are bounded at 100 items per tick to fit within Vercel's
 * function timeout with comfortable margin. Stragglers wait one more day —
 * which is fine because these are recovery paths, not the primary flow.
 *
 * Vercel Cron does not auto-retry on failure. Per-item failures are logged
 * in the response body; a 207 surfaces partial failure to monitoring.
 */

// Hard cap on items per sweep. Each sweep does I/O per item (DB read +
// Stripe call for sweep 1; DB writes + Resend call for sweep 2) so 100 is
// the conservative cap that comfortably fits the 300s function ceiling.
const SWEEP_LIMIT = 100;

interface CommitmentBagChargeRow {
  commitment_id: string;
  bag_number: number;
  payment_status:
    | "awaiting_charge"
    | "charging"
    | "charged"
    | "retry_scheduled"
    | "payment_failed";
  commitment: { lot_id: string } | { lot_id: string }[] | null;
}

export async function GET(request: Request) {
  const unauthorized = authorizeCronRequest(request);
  if (unauthorized) return unauthorized;

  const admin = createAdminClient();

  // -----------------------------------------------------------------
  // Sweep 1 — Stuck bag transfers (M5)
  // -----------------------------------------------------------------
  // Strategy: pull recent `commitment_bag_charges` rows joined to their
  // commitment's lot_id, group client-side by (commitment_id, bag_number),
  // keep groups where every row is terminal, then exclude any group whose
  // (lot_id, bag_number) already has a `bag_transfers` row. Whatever's
  // left needs the transfer-out helper invoked.
  //
  // We do this client-side rather than via a SQL view because the helper
  // already encapsulates the all-terminal + idempotency logic — we just
  // need a candidate list small enough to iterate. The 100-item cap on
  // the candidate list, not the underlying rows, keeps the loop bounded.
  let sweep1Swept = 0;
  let sweep1Skipped = 0;
  const sweep1Reasons: Array<{
    commitment_id: string;
    bag_number: number;
    status: string;
    reason?: string;
  }> = [];

  // Pull terminal-only candidate rows. We bound the scan with a row
  // limit large enough to cover plausible per-day volume while keeping
  // the worst-case grouping work O(N) bounded.
  const { data: candidateRows, error: candidateError } = await admin
    .from("commitment_bag_charges")
    .select(
      "commitment_id, bag_number, payment_status, commitment:commitment_id!inner(lot_id)"
    )
    .in("payment_status", ["charged", "payment_failed"])
    .limit(SWEEP_LIMIT * 10);

  if (candidateError) {
    return NextResponse.json(
      { error: `sweep_1_candidate_query_failed: ${candidateError.message}` },
      { status: 500 }
    );
  }

  // Group by (commitment_id, bag_number). A group is sweep-eligible if
  // every member is terminal — but we already filtered for terminal-only
  // above, so what's actually checked is "are there ANY non-terminal
  // siblings for the same (commitment, bag)?" via a follow-up query.
  type GroupKey = string;
  const groups = new Map<
    GroupKey,
    { commitmentId: string; bagNumber: number; lotId: string }
  >();
  for (const r of (candidateRows || []) as CommitmentBagChargeRow[]) {
    const lotId = Array.isArray(r.commitment)
      ? r.commitment[0]?.lot_id
      : r.commitment?.lot_id;
    if (!lotId) continue;
    const key = `${r.commitment_id}::${r.bag_number}`;
    if (!groups.has(key)) {
      groups.set(key, {
        commitmentId: r.commitment_id,
        bagNumber: r.bag_number,
        lotId,
      });
    }
  }

  // For each candidate group, check (a) no non-terminal sibling row
  // exists, and (b) no bag_transfers row for (lot_id, bag_number). The
  // helper's own idempotency guard would also catch (b), but checking
  // here avoids the per-bag join + Stripe call when nothing to do.
  const groupEntries = Array.from(groups.values()).slice(0, SWEEP_LIMIT);

  for (const g of groupEntries) {
    // (a) any non-terminal sibling for this (commitment, bag)?
    const { data: nonTerminal, error: ntError } = await admin
      .from("commitment_bag_charges")
      .select("id")
      .eq("commitment_id", g.commitmentId)
      .eq("bag_number", g.bagNumber)
      .in("payment_status", ["awaiting_charge", "charging", "retry_scheduled"])
      .limit(1);
    if (ntError) {
      sweep1Skipped += 1;
      sweep1Reasons.push({
        commitment_id: g.commitmentId,
        bag_number: g.bagNumber,
        status: "skipped",
        reason: `non_terminal_query_failed: ${ntError.message}`,
      });
      continue;
    }
    if (nonTerminal && nonTerminal.length > 0) {
      // Still in-flight — worker will handle.
      sweep1Skipped += 1;
      continue;
    }

    // (b) bag_transfers row already exists for (lot_id, bag_number)?
    const { data: existing, error: existingError } = await admin
      .from("bag_transfers")
      .select("lot_id")
      .eq("lot_id", g.lotId)
      .eq("bag_number", g.bagNumber)
      .maybeSingle();
    if (existingError) {
      sweep1Skipped += 1;
      sweep1Reasons.push({
        commitment_id: g.commitmentId,
        bag_number: g.bagNumber,
        status: "skipped",
        reason: `bag_transfers_lookup_failed: ${existingError.message}`,
      });
      continue;
    }
    if (existing) {
      // Already transferred. Skip silently — no need to surface.
      continue;
    }

    // Fire the helper. It re-validates everything itself; we just trigger.
    const result = await transferOutBagIfReady(admin, {
      commitmentId: g.commitmentId,
      bagNumber: g.bagNumber,
    });

    if (result.status === "transferred") {
      sweep1Swept += 1;
    } else {
      sweep1Skipped += 1;
      sweep1Reasons.push({
        commitment_id: g.commitmentId,
        bag_number: g.bagNumber,
        status: result.status,
        reason: result.reason,
      });
    }
  }

  // -----------------------------------------------------------------
  // Sweep 2 — Failed settlement emails (M6)
  // -----------------------------------------------------------------
  // Find commitments whose most-recent settlement email attempt failed,
  // clear both the stamp and the status so the trigger's atomic re-stamp
  // path runs cleanly, then re-invoke the trigger. The trigger's atomic
  // UPDATE on `settlement_email_sent_at` still gates duplicate sends if
  // a worker tick races us between the clear and the re-stamp — we'd
  // simply see `'already_sent'` on the second attempt and bow out.
  let sweep2Swept = 0;
  let sweep2Failed = 0;
  const sweep2Reasons: Array<{
    commitment_id: string;
    status: string;
    reason?: string;
  }> = [];

  const { data: failedRows, error: failedError } = await admin
    .from("commitments")
    .select("id")
    .eq("settlement_email_status", "send_failed")
    .limit(SWEEP_LIMIT);

  if (failedError) {
    // Sweep 1 results are still meaningful — return them alongside the
    // sweep-2 failure rather than 500ing the whole response.
    return NextResponse.json(
      {
        sweep_1_swept: sweep1Swept,
        sweep_1_skipped: sweep1Skipped,
        sweep_1_reasons: sweep1Reasons,
        sweep_2_swept: 0,
        sweep_2_failed: 0,
        sweep_2_error: `sweep_2_query_failed: ${failedError.message}`,
      },
      { status: 207 }
    );
  }

  for (const row of (failedRows || []) as Array<{ id: string }>) {
    // Clear the stamp + status so the trigger's atomic claim runs fresh.
    // If the clear itself fails, count as a failure and skip — the
    // trigger would short-circuit on `already_sent` otherwise.
    const { error: clearError } = await admin
      .from("commitments")
      .update({
        settlement_email_sent_at: null,
        settlement_email_status: null,
      })
      .eq("id", row.id);
    if (clearError) {
      sweep2Failed += 1;
      sweep2Reasons.push({
        commitment_id: row.id,
        status: "skipped",
        reason: `clear_failed: ${clearError.message}`,
      });
      continue;
    }

    const result = await sendSettlementEmailIfReady(admin, row.id);
    if (result.status === "sent") {
      sweep2Swept += 1;
    } else {
      sweep2Failed += 1;
      sweep2Reasons.push({
        commitment_id: row.id,
        status: result.status,
        reason: result.reason,
      });
    }
  }

  // 207 (Multi-Status) when either sweep had non-trivial failures, so
  // monitoring surfaces partial-success without losing the per-item
  // detail in the body. Both-zero-failures path returns 200.
  const partial = sweep1Reasons.length > 0 || sweep2Failed > 0;

  return NextResponse.json(
    {
      sweep_1_swept: sweep1Swept,
      sweep_1_skipped: sweep1Skipped,
      sweep_1_reasons: sweep1Reasons,
      sweep_2_swept: sweep2Swept,
      sweep_2_failed: sweep2Failed,
      sweep_2_reasons: sweep2Reasons,
    },
    { status: partial ? 207 : 200 }
  );
}

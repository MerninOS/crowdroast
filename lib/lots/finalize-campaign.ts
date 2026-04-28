import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export type FinalizeOutcome = "settled" | "failed" | "cancelled";

export type FinalizeCampaignResult = { ok: true } | { ok: false; error: string };

/**
 * Atomically transition a campaign to a terminal state and recycle its lot.
 * Wraps the finalize_campaign Postgres function which:
 *   1. Locks the campaign row (FOR UPDATE) and no-ops if it's not 'active'
 *      — this gives us idempotency on retry and safety against concurrent
 *      callers without us doing our own check-then-act.
 *   2. For 'cancelled' outcomes, cancels any non-cancelled commitments.
 *      For 'settled' and 'failed', the caller is expected to have already
 *      handled per-commitment Stripe work before calling this.
 *   3. Updates the campaign row to its terminal status.
 *   4. Clears hub_lots for the lot, sets lots.status='awaiting_relist',
 *      resets committed_quantity_kg, and nulls hubs.featured_lot_id.
 *
 * All four happen inside a single Postgres transaction, so partial failure
 * rolls back. On retry the campaign is still 'active' and the call repeats.
 */
export async function finalizeCampaign(
  admin: AdminClient,
  campaignId: string,
  outcome: FinalizeOutcome
): Promise<FinalizeCampaignResult> {
  const { error } = await admin.rpc("finalize_campaign", {
    p_campaign_id: campaignId,
    p_outcome: outcome,
  });

  if (error) {
    const pgErr = error as {
      message?: string;
      code?: string;
      details?: string;
      hint?: string;
    };
    const detail = [pgErr.code, pgErr.message, pgErr.details, pgErr.hint]
      .filter(Boolean)
      .join(" — ");
    return { ok: false, error: detail || "finalize_campaign rpc failed" };
  }

  return { ok: true };
}

import type { SupabaseClient } from "@supabase/supabase-js";

// Flat $10 credit per successful invitee. Replaces the older 2%-of-gross
// model so CAC is predictable and known in advance.
export const REFERRAL_CREDIT_AMOUNT_CENTS = 1000;

// Called per-commitment in the lot-settle-success branch of settle-deadlines.
// If a pending referral_attribution row exists for the commitment, flip it to
// 'earned' and insert a +1000 cent credit_ledger row for the inviter. Both
// operations are idempotent: the WHERE status='pending' clause makes the
// attribution flip a no-op on retry, and the partial unique index
// idx_credit_ledger_referral_earned_unique on (source_attribution_id) WHERE
// reason='referral_earned' ensures at most one ledger row per attribution.
//
// Returns the inviter_user_id when a ledger row was inserted, so the caller
// can fire the ReferralCreditEarned email as a background task. Null when
// no attribution exists, no-op when already earned, or when the cron retried.
export async function settleAttributionIfPending(
  admin: SupabaseClient,
  commitmentId: string
): Promise<{
  earned: boolean;
  inviterUserId: string | null;
  reason?: string;
}> {
  if (!commitmentId) return { earned: false, inviterUserId: null, reason: "missing_commitment_id" };

  const { data: attribution } = await admin
    .from("referral_attributions")
    .select("id, status, inviter_user_id, invitee_user_id, campaign_id")
    .eq("commitment_id", commitmentId)
    .maybeSingle();

  if (!attribution) {
    return { earned: false, inviterUserId: null, reason: "no_attribution" };
  }

  if (attribution.status !== "pending") {
    // Already earned (or already voided by a misordered call). Defensive
    // no-op: don't insert a ledger row, don't double-flip.
    return { earned: false, inviterUserId: null, reason: "not_pending" };
  }

  // Flip to earned. The where-clause filter on status makes this idempotent —
  // a concurrent call that also passed the pending check will end up with
  // zero rows updated on the second pass.
  const { error: updateError } = await admin
    .from("referral_attributions")
    .update({ status: "earned", earned_at: new Date().toISOString() })
    .eq("id", attribution.id)
    .eq("status", "pending");

  if (updateError) {
    return { earned: false, inviterUserId: null, reason: updateError.message };
  }

  // Insert the credit ledger row. The partial unique index handles the cron-
  // retry case: if a previous invocation already inserted, the second insert
  // raises 23505 which we swallow.
  const { error: insertError } = await admin.from("credit_ledger").insert({
    user_id: attribution.inviter_user_id,
    amount_cents: REFERRAL_CREDIT_AMOUNT_CENTS,
    reason: "referral_earned",
    source_attribution_id: attribution.id,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      // Idempotency win — cron retried and the credit already landed on a
      // prior pass. Treat as success but signal to caller not to re-email.
      return { earned: false, inviterUserId: null, reason: "ledger_already_recorded" };
    }
    return { earned: false, inviterUserId: null, reason: insertError.message };
  }

  return { earned: true, inviterUserId: attribution.inviter_user_id };
}

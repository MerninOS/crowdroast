import type { SupabaseClient } from "@supabase/supabase-js";

// Inserts a referral_attributions(pending) row for the buyer behind this
// commitment, if and only if:
//
//   - the commitment exists and has payment_status = 'charge_succeeded'
//   - the buyer's profile has a non-null invited_by_user_id
//   - the buyer doesn't already have an attribution row anywhere
//     (criterion 13 lock — first inviter wins, locked-once-written)
//
// All conditions are evaluated server-side in a single helper so charge-
// success handlers (Stripe webhook + the settle-deadlines self-correction
// path) call one entry point. Idempotent — calling it twice for the same
// commitment is a no-op via the unique (invitee_user_id) and unique
// (commitment_id) constraints on referral_attributions.
//
// Spec criterion 6: attribution is created at first charge_succeeded, NOT
// at commitment row insert. A commitment cancelled before charge does not
// lock the attribution; the invitee's next charged commitment carries it.
export async function insertReferralAttributionIfEligible(
  admin: SupabaseClient,
  commitmentId: string
): Promise<{ inserted: boolean; reason?: string }> {
  if (!commitmentId) return { inserted: false, reason: "missing_commitment_id" };

  // Load commitment.
  const { data: commitment } = await admin
    .from("commitments")
    .select("id, buyer_id, campaign_id, payment_status")
    .eq("id", commitmentId)
    .maybeSingle();

  if (!commitment) return { inserted: false, reason: "commitment_not_found" };
  if (commitment.payment_status !== "charge_succeeded") {
    return { inserted: false, reason: "not_charge_succeeded" };
  }

  // Look up the buyer's inviter, if any.
  const { data: profile } = await admin
    .from("profiles")
    .select("invited_by_user_id")
    .eq("id", commitment.buyer_id)
    .maybeSingle();

  if (!profile?.invited_by_user_id) {
    return { inserted: false, reason: "no_inviter" };
  }

  // Pre-check: criterion 13 lock — invitee can only have one attribution
  // ever, regardless of which commitment was their first charge. This also
  // makes calling the helper twice for the same commitment a clean no-op
  // since the second call will find the attribution row from the first.
  const { data: existing } = await admin
    .from("referral_attributions")
    .select("id")
    .eq("invitee_user_id", commitment.buyer_id)
    .maybeSingle();

  if (existing) return { inserted: false, reason: "already_attributed" };

  // Insert. The unique (invitee_user_id) and unique (commitment_id) indexes
  // make a concurrent-insert race fall back to no-op cleanly — we swallow
  // 23505 here so a webhook+cron double-fire just leaves the row from
  // whichever request won.
  const { error } = await admin.from("referral_attributions").insert({
    inviter_user_id: profile.invited_by_user_id,
    invitee_user_id: commitment.buyer_id,
    commitment_id: commitment.id,
    campaign_id: commitment.campaign_id,
    status: "pending",
  });

  if (error) {
    if (error.code === "23505") {
      // Lost a race — another path inserted first. That's fine.
      return { inserted: false, reason: "race_lost" };
    }
    return { inserted: false, reason: error.message };
  }

  return { inserted: true };
}

import type { SupabaseClient } from "@supabase/supabase-js";

// Called once per failed/cancelled campaign in settle-deadlines. Flips every
// pending referral_attribution for the campaign to voided. The where-clause
// filter on status='pending' is critical: an attribution that has already
// been earned (would be unusual on a failed lot, but defensively supported)
// must not be clawed back. No credit_ledger writes here — voiding never
// touches money. Earned credits are not reversed even if the lot somehow
// later got marked failed (criterion 8 failure case).
export async function voidAttributionsForCampaign(
  admin: SupabaseClient,
  campaignId: string
): Promise<{ voided: number }> {
  if (!campaignId) return { voided: 0 };

  const { data, error } = await admin
    .from("referral_attributions")
    .update({ status: "voided" })
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .select("id");

  if (error) return { voided: 0 };
  return { voided: (data ?? []).length };
}

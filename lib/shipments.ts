import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Creates a pending shipment record for a lot when its campaign successfully
 * settles. Idempotent per (lot_id, campaign_id) — re-running the cron for the
 * same campaign returns the existing row instead of inserting a duplicate.
 *
 * Scoping by campaign_id (not lot_id alone) is what lets a lot that's been
 * relisted after a prior cycle get a brand-new shipment for the new campaign,
 * even if the prior cycle left a shipment row behind.
 *
 * Never throws. Returns null on error so callers can fire-and-forget safely.
 */
export async function createShipmentForLot(
  lotId: string,
  hubId: string | null,
  campaignId: string | null
): Promise<{ id: string } | null> {
  const admin = createAdminClient();

  try {
    if (campaignId) {
      const { data: existing } = await admin
        .from("shipments")
        .select("id")
        .eq("lot_id", lotId)
        .eq("campaign_id", campaignId)
        .maybeSingle();

      if (existing) {
        return existing;
      }
    }

    const { data, error } = await admin
      .from("shipments")
      .insert({ lot_id: lotId, hub_id: hubId, campaign_id: campaignId, status: "pending" })
      .select("id")
      .single();

    if (error) {
      console.error("[createShipmentForLot] Insert failed:", error);
      return null;
    }

    return data;
  } catch (err) {
    console.error("[createShipmentForLot] Unexpected error:", err);
    return null;
  }
}

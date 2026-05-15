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
 * `weightKg` (optional) is the total kilograms the seller needs to ship,
 * computed by the caller from the campaign's settled state. For bag-aware
 * campaigns this is the sum of `commitments.kg_locked_at_settlement`
 * across confirmed commits (i.e. settled bags × bag_size_kg). For legacy
 * payment-mode campaigns it's the sum of `quantity_kg` across the
 * successfully-charged commits. Pre-fix this was always NULL and the
 * seller shipments page just hid the "Weight" section.
 *
 * Idempotency note: when a shipment already exists for this (lot, campaign)
 * we DO NOT overwrite the existing weight_kg — the seller may have edited
 * it after creation, and a retry shouldn't clobber that.
 *
 * Never throws. Returns null on error so callers can fire-and-forget safely.
 */
export async function createShipmentForLot(
  lotId: string,
  hubId: string | null,
  campaignId: string | null,
  weightKg?: number | null
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

    const insertPayload: Record<string, unknown> = {
      lot_id: lotId,
      hub_id: hubId,
      campaign_id: campaignId,
      status: "pending",
    };
    if (typeof weightKg === "number" && Number.isFinite(weightKg) && weightKg > 0) {
      insertPayload.weight_kg = weightKg;
    }

    const { data, error } = await admin
      .from("shipments")
      .insert(insertPayload)
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

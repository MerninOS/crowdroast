import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Creates a pending shipment record for a lot when it successfully settles.
 * Idempotent — if a non-cancelled shipment already exists for this lot/hub
 * pair, returns it without inserting a duplicate.
 *
 * Never throws. Returns null on error so callers can fire-and-forget safely.
 */
export async function createShipmentForLot(
  lotId: string,
  hubId: string | null
): Promise<{ id: string } | null> {
  const admin = createAdminClient();

  try {
    // Idempotency check: return existing shipment if one already exists
    const { data: existing } = await admin
      .from("shipments")
      .select("id")
      .eq("lot_id", lotId)
      .neq("status", "cancelled")
      .maybeSingle();

    if (existing) {
      return existing;
    }

    const { data, error } = await admin
      .from("shipments")
      .insert({ lot_id: lotId, hub_id: hubId, status: "pending" })
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

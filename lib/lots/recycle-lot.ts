import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export type RecycleLotResult = { ok: true } | { ok: false; error: string };

/**
 * Atomically recycle a lot after a campaign reaches a terminal state:
 * clears every hub_lots row for the lot, transitions it to 'awaiting_relist'
 * with committed_quantity_kg=0, and nulls hubs.featured_lot_id wherever it
 * pointed at this lot. All three mutations run inside the recycle_lot
 * Postgres function, so partial failure rolls back.
 */
export async function recycleLot(
  admin: AdminClient,
  lotId: string
): Promise<RecycleLotResult> {
  const { error } = await admin.rpc("recycle_lot", { p_lot_id: lotId });

  if (error) {
    return {
      ok: false,
      error: (error as { message?: string }).message || "recycle_lot rpc failed",
    };
  }

  return { ok: true };
}

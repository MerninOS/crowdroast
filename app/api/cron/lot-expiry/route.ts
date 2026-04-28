import { createAdminClient } from "@/lib/supabase/admin";
import { sendLotExpiredEmail } from "@/lib/email";
import { recycleLot } from "@/lib/lots/recycle-lot";
import { NextResponse } from "next/server";

function getBearerToken(header: string | null) {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer") return null;
  return token || null;
}

/**
 * Lot expiry cron — runs daily at 01:00 UTC (after settlement at 00:00 UTC).
 *
 * Finds lots whose expiry_date has passed and that have no active or settled
 * campaign. Recycles them (clears hub_lots, sets status='awaiting_relist',
 * resets committed_quantity_kg, nulls featured_lot_id) and notifies the
 * seller so they can adjust the lot and decide whether to relist.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Missing CRON_SECRET" }, { status: 500 });
  }

  const bearer = getBearerToken(request.headers.get("authorization"));
  const headerSecret = request.headers.get("x-cron-secret");
  if (bearer !== cronSecret && headerSecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // Fetch lots past their expiry_date that are still active or fully_committed
  const { data: lots, error: lotsError } = await admin
    .from("lots")
    .select("id, title, seller_id")
    .in("status", ["active", "fully_committed"])
    .lte("expiry_date", now);

  if (lotsError) {
    return NextResponse.json({ error: lotsError.message }, { status: 500 });
  }

  let expiredCount = 0;
  const recycleFailures: Array<{ lot_id: string; error: string }> = [];

  for (const lot of lots || []) {
    // Check if there's an active or settled campaign for this lot — if so, skip
    const { data: campaigns } = await admin
      .from("campaigns")
      .select("id, status")
      .eq("lot_id", lot.id)
      .in("status", ["active", "settled"]);

    if (campaigns && campaigns.length > 0) {
      continue;
    }

    // Recycle the lot: clear hub_lots, set status='awaiting_relist',
    // committed_quantity_kg=0, and null any featured-lot references.
    const recycleResult = await recycleLot(admin, lot.id);
    if (!recycleResult.ok) {
      console.error(`lot-expiry: failed to recycle lot ${lot.id}`, recycleResult.error);
      recycleFailures.push({ lot_id: lot.id, error: recycleResult.error });
      continue;
    }

    // Fetch seller profile and send notification
    const { data: seller } = await admin
      .from("profiles")
      .select("email, contact_name")
      .eq("id", lot.seller_id)
      .single();

    if (seller) {
      await sendLotExpiredEmail({
        seller: { email: seller.email, contact_name: seller.contact_name },
        lot: { id: lot.id, title: lot.title },
      }).catch(console.error);
    }

    expiredCount += 1;
  }

  return NextResponse.json(
    {
      expired_lots: expiredCount,
      checked_lots: (lots || []).length,
      recycle_failures: recycleFailures,
    },
    // 207 (Multi-Status) when some lots failed to recycle. Cron retry logic
    // can use the non-2xx status to surface the failure; the success metrics
    // remain in the body so partial progress is still visible.
    { status: recycleFailures.length > 0 ? 207 : 200 }
  );
}

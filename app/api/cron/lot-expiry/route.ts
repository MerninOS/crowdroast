import { createAdminClient } from "@/lib/supabase/admin";
import { sendLotExpiredEmail } from "@/lib/email";
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
 * campaign. Marks them as expired and notifies the seller.
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

    // Mark lot as expired
    await admin
      .from("lots")
      .update({
        status: "expired",
        settlement_status: "minimum_not_met",
        settlement_processed_at: now,
      })
      .eq("id", lot.id);

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
    { expired_lots: expiredCount, checked_lots: (lots || []).length },
    { status: 200 }
  );
}

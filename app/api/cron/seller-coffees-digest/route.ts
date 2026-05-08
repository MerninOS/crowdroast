import { createAdminClient } from "@/lib/supabase/admin";
import { sendSellerCoffeesDigestEmail } from "@/lib/email";
import type { DigestSellerGroup } from "@/lib/email/templates/SellerCoffeesDigest";
import { authorizeCronRequest } from "@/lib/auth/cron-route";
import { NextResponse } from "next/server";

/**
 * Hub-owner digest: "New coffees from your sellers."
 *
 * One email per hub owner per run, grouping every new lot since their last
 * digest by seller. A hub owner is "connected" to a seller if either:
 *   1. One of the hub owner's hubs currently features a lot from that seller, or
 *   2. The hub owner has ever requested a sample from one of the seller's lots.
 *
 * Schedule: 17:00 UTC daily (see vercel.json).
 */

type SellerRow = {
  id: string;
  contact_name: string | null;
  company_name: string | null;
};

type LotRow = {
  id: string;
  seller_id: string;
  title: string;
  origin_country: string;
  price_per_kg: number;
  currency: string | null;
  created_at: string;
};

const FALLBACK_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

async function runDigest(request: Request) {
  const unauthorized = authorizeCronRequest(request);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const debug = searchParams.get("debug") === "1";

  const admin = createAdminClient();
  const now = new Date();
  const fallbackSince = new Date(now.getTime() - FALLBACK_LOOKBACK_MS).toISOString();

  // 1. Find every hub owner with at least one hub.
  const { data: hubs, error: hubsError } = await admin
    .from("hubs")
    .select("owner_id");
  if (hubsError) return NextResponse.json({ error: hubsError.message }, { status: 500 });

  const ownerIds = [...new Set((hubs || []).map((h) => h.owner_id))];
  if (ownerIds.length === 0) {
    return NextResponse.json({ recipients: 0, sent: 0, results: [] }, { status: 200 });
  }

  const { data: ownerProfiles, error: profilesError } = await admin
    .from("profiles")
    .select("id, email, contact_name, last_seller_coffees_digest_at")
    .in("id", ownerIds);
  if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 500 });

  const results: Array<Record<string, unknown>> = [];
  let sent = 0;

  for (const owner of ownerProfiles || []) {
    if (!owner.email) continue;

    const since =
      (owner.last_seller_coffees_digest_at as string | null) || fallbackSince;

    // 2. Find every seller this hub owner is connected to.
    //    Path A: lots from this seller currently in any of the owner's hubs.
    //    Path B: a sample request submitted by this owner against any of the
    //            seller's lots.
    const { data: ownerHubs } = await admin
      .from("hubs")
      .select("id")
      .eq("owner_id", owner.id);
    const ownerHubIds = (ownerHubs || []).map((h) => h.id);

    const sellerIds = new Set<string>();

    if (ownerHubIds.length > 0) {
      const { data: hubLotsSellers } = await admin
        .from("hub_lots")
        .select("lots!hub_lots_lot_id_fkey(seller_id)")
        .in("hub_id", ownerHubIds);
      for (const row of hubLotsSellers || []) {
        const sellerId = (row.lots as { seller_id?: string } | null)?.seller_id;
        if (sellerId) sellerIds.add(sellerId);
      }
    }

    const { data: sampleRequests } = await admin
      .from("sample_requests")
      .select("lots!sample_requests_lot_id_fkey(seller_id)")
      .eq("buyer_id", owner.id);
    for (const row of sampleRequests || []) {
      const sellerId = (row.lots as { seller_id?: string } | null)?.seller_id;
      if (sellerId) sellerIds.add(sellerId);
    }

    if (sellerIds.size === 0) {
      results.push({ owner: owner.id, sent: false, reason: "no_connected_sellers" });
      continue;
    }

    // 3. Pull every lot those sellers created since the last digest.
    const { data: newLots } = await admin
      .from("lots")
      .select("id, seller_id, title, origin_country, price_per_kg, currency, created_at")
      .in("seller_id", [...sellerIds])
      .gte("created_at", since)
      .order("created_at", { ascending: false });

    if (!newLots || newLots.length === 0) {
      results.push({ owner: owner.id, sent: false, reason: "no_new_lots" });
      continue;
    }

    // 4. Group lots by seller.
    const sellerProfilesNeeded = [...new Set(newLots.map((l) => l.seller_id))];
    const { data: sellerProfiles } = await admin
      .from("profiles")
      .select("id, contact_name, company_name")
      .in("id", sellerProfilesNeeded);

    const sellersById = new Map<string, SellerRow>(
      (sellerProfiles || []).map((p) => [p.id, p as SellerRow])
    );

    const groups = new Map<string, DigestSellerGroup>();
    for (const lot of newLots as LotRow[]) {
      const seller = sellersById.get(lot.seller_id);
      const sellerName =
        seller?.company_name || seller?.contact_name || "A seller";
      const group = groups.get(lot.seller_id) ?? {
        sellerName,
        newLots: [],
      };
      group.newLots.push({
        title: lot.title,
        originCountry: lot.origin_country,
        pricePerKg: lot.price_per_kg,
        currency: lot.currency || "USD",
      });
      groups.set(lot.seller_id, group);
    }

    const sellersForEmail = [...groups.values()].sort(
      (a, b) => b.newLots.length - a.newLots.length
    );
    const totalLots = sellersForEmail.reduce((sum, g) => sum + g.newLots.length, 0);

    if (debug) {
      results.push({
        owner: owner.id,
        sent: false,
        debug: true,
        would_send: { totalLots, sellers: sellersForEmail.length },
      });
      continue;
    }

    const result = await sendSellerCoffeesDigestEmail({
      hubOwner: { email: owner.email, contact_name: owner.contact_name },
      windowLabel: owner.last_seller_coffees_digest_at
        ? "since your last digest"
        : "in the last 7 days",
      sellers: sellersForEmail,
    });

    if (result.success) {
      sent += 1;
      // Only advance the cursor on a successful send so a transient Resend
      // failure doesn't drop a digest's worth of new coffees on the floor.
      await admin
        .from("profiles")
        .update({ last_seller_coffees_digest_at: now.toISOString() })
        .eq("id", owner.id);
      results.push({
        owner: owner.id,
        sent: true,
        totalLots,
        sellers: sellersForEmail.length,
      });
    } else {
      results.push({ owner: owner.id, sent: false, error: result.error });
    }
  }

  return NextResponse.json(
    {
      recipients: ownerProfiles?.length || 0,
      sent,
      results,
    },
    { status: 200 }
  );
}

export async function GET(request: Request) {
  return runDigest(request);
}

export async function POST(request: Request) {
  return runDigest(request);
}

import { createAdminClient } from "@/lib/supabase/admin";
import { sendHubCampaignsDigestEmail } from "@/lib/email";
import type { DigestHubGroup } from "@/lib/email/templates/HubCampaignsDigest";
import { authorizeCronRequest } from "@/lib/auth/cron-route";
import { NextResponse } from "next/server";

/**
 * Buyer digest: "New campaigns are live."
 *
 * Buyers only hear about campaigns — the moment a lot becomes actionable.
 * Catalog adds without a campaign are intentionally silent.
 *
 * One consolidated email per buyer, even when they belong to multiple hubs.
 *
 * Schedule: 16:00 UTC every 3rd day (see vercel.json).
 */

type CampaignRow = {
  id: string;
  hub_id: string;
  deadline: string;
  created_at: string;
  status: string;
  lots: {
    title: string;
    origin_country: string;
    price_per_kg: number;
    currency: string | null;
  } | null;
  hubs: { id: string; name: string } | null;
};

const FALLBACK_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

function formatDeadline(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

async function runDigest(request: Request) {
  const unauthorized = authorizeCronRequest(request);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const debug = searchParams.get("debug") === "1";

  const admin = createAdminClient();
  const now = new Date();
  const fallbackSince = new Date(now.getTime() - FALLBACK_LOOKBACK_MS).toISOString();

  // 1. Load every active buyer membership. Hub owners and removed/invited
  //    members are skipped.
  const { data: memberships, error: membershipsError } = await admin
    .from("hub_members")
    .select("user_id, hub_id")
    .eq("status", "active")
    .eq("role", "buyer")
    .not("user_id", "is", null);
  if (membershipsError)
    return NextResponse.json({ error: membershipsError.message }, { status: 500 });

  if (!memberships || memberships.length === 0) {
    return NextResponse.json({ recipients: 0, sent: 0, results: [] }, { status: 200 });
  }

  // Group hub IDs by buyer.
  const hubsByBuyer = new Map<string, Set<string>>();
  for (const m of memberships) {
    if (!m.user_id) continue;
    const set = hubsByBuyer.get(m.user_id) ?? new Set<string>();
    set.add(m.hub_id);
    hubsByBuyer.set(m.user_id, set);
  }

  const buyerIds = [...hubsByBuyer.keys()];
  const { data: buyerProfiles, error: profilesError } = await admin
    .from("profiles")
    .select("id, email, contact_name, last_hub_campaigns_digest_at")
    .in("id", buyerIds);
  if (profilesError)
    return NextResponse.json({ error: profilesError.message }, { status: 500 });

  const results: Array<Record<string, unknown>> = [];
  let sent = 0;

  for (const buyer of buyerProfiles || []) {
    if (!buyer.email) continue;

    const hubIds = [...(hubsByBuyer.get(buyer.id) ?? [])];
    if (hubIds.length === 0) continue;

    const since =
      (buyer.last_hub_campaigns_digest_at as string | null) || fallbackSince;

    // 2. Find campaigns that opened in the buyer's hubs since their cursor.
    //    A campaign goes live the moment its row is inserted with status
    //    'active', so created_at is the source of truth for "started."
    const { data: campaigns } = await admin
      .from("campaigns")
      .select(
        `id, hub_id, deadline, created_at, status,
         lots:lots!campaigns_lot_id_fkey(title, origin_country, price_per_kg, currency),
         hubs:hubs!campaigns_hub_id_fkey(id, name)`
      )
      .in("hub_id", hubIds)
      .gte("created_at", since)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false });

    const rows = (campaigns || []) as unknown as CampaignRow[];
    if (rows.length === 0) {
      results.push({ buyer: buyer.id, sent: false, reason: "no_new_campaigns" });
      continue;
    }

    // 3. Group by hub.
    const hubGroups = new Map<string, DigestHubGroup>();
    for (const c of rows) {
      if (!c.lots || !c.hubs) continue;
      const group = hubGroups.get(c.hub_id) ?? {
        hubName: c.hubs.name,
        campaigns: [],
      };
      group.campaigns.push({
        lotTitle: c.lots.title,
        originCountry: c.lots.origin_country,
        pricePerKg: c.lots.price_per_kg,
        currency: c.lots.currency || "USD",
        deadlineLabel: formatDeadline(c.deadline),
      });
      hubGroups.set(c.hub_id, group);
    }

    const hubsForEmail = [...hubGroups.values()].sort(
      (a, b) => b.campaigns.length - a.campaigns.length
    );
    const totalCampaigns = hubsForEmail.reduce(
      (sum, h) => sum + h.campaigns.length,
      0
    );

    if (totalCampaigns === 0) {
      results.push({ buyer: buyer.id, sent: false, reason: "no_renderable_campaigns" });
      continue;
    }

    if (debug) {
      results.push({
        buyer: buyer.id,
        sent: false,
        debug: true,
        would_send: { totalCampaigns, hubs: hubsForEmail.length },
      });
      continue;
    }

    const result = await sendHubCampaignsDigestEmail({
      buyer: { email: buyer.email, contact_name: buyer.contact_name },
      windowLabel: buyer.last_hub_campaigns_digest_at
        ? "since your last digest"
        : "in the last 7 days",
      hubs: hubsForEmail,
    });

    if (result.success) {
      sent += 1;
      await admin
        .from("profiles")
        .update({ last_hub_campaigns_digest_at: now.toISOString() })
        .eq("id", buyer.id);
      results.push({
        buyer: buyer.id,
        sent: true,
        totalCampaigns,
        hubs: hubsForEmail.length,
      });
    } else {
      results.push({ buyer: buyer.id, sent: false, error: result.error });
    }
  }

  return NextResponse.json(
    {
      recipients: buyerProfiles?.length || 0,
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

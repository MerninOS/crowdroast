import { createAdminClient } from "@/lib/supabase/admin";
import { sendPriceDropInvestorEmail, sendPriceDropNonInvestorEmail } from "@/lib/email";
import { getTierProgress } from "@/lib/tier-progress";
import { authorizeCronRequest } from "@/lib/auth/cron-route";
import { NextResponse } from "next/server";

/**
 * AC-8b/c: Price drop notifications.
 *
 * Scans active lots where the current effective price (after volume milestones)
 * is lower than the lot's base price_per_kg. Notifies:
 *   - Existing investors (AC-8b): "you can buy more at the lower price"
 *   - Non-investors in the hub (AC-8c): "price dropped, consider committing"
 *
 * IDEMPOTENCY NOTE: This route requires a `price_drop_notifications` table to
 * avoid sending duplicate emails across cron runs. Schema:
 *
 *   create table price_drop_notifications (
 *     id uuid primary key default gen_random_uuid(),
 *     lot_id uuid not null references lots(id),
 *     notified_price_per_kg numeric not null,
 *     notified_at timestamptz not null default now(),
 *     unique(lot_id, notified_price_per_kg)
 *   );
 *
 * Until that migration is applied, this route returns { status: "requires_migration" }.
 *
 * Schedule suggestion (vercel.json): every 15 minutes — "* /15 * * * *"
 */
async function sendPriceDropNotifications(request: Request) {
  const unauthorized = authorizeCronRequest(request);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const debug = searchParams.get("debug") === "1";

  const admin = createAdminClient();

  // Check whether the idempotency table exists before proceeding
  const { error: tableCheckError } = await admin
    .from("price_drop_notifications")
    .select("id")
    .limit(1);

  if (tableCheckError?.message?.includes("price_drop_notifications")) {
    return NextResponse.json(
      {
        status: "requires_migration",
        message:
          "price_drop_notifications table not found. Apply the migration described in this route's JSDoc before enabling price drop emails.",
      },
      { status: 200 }
    );
  }

  // Fetch active lots that have pricing tiers (volume discounts).
  // bag_size_kg is needed so getTierProgress can resolve bag-aware tiers
  // the same way settlement does (lib/settle-bag-pricing.ts) — without it,
  // we'd fire price-drop notifications at weight thresholds even though
  // settlement only credits the tier at completed-bag boundaries.
  const { data: lots, error: lotsError } = await admin
    .from("lots")
    .select(
      "id, title, price_per_kg, currency, committed_quantity_kg, commitment_deadline, bag_size_kg"
    )
    .in("status", ["active", "fully_committed"]);

  if (lotsError) {
    return NextResponse.json({ error: lotsError.message }, { status: 500 });
  }

  const results: Array<Record<string, unknown>> = [];

  for (const lot of lots || []) {
    const { data: tiers } = await admin
      .from("pricing_tiers")
      .select("min_bags, min_quantity_kg, price_per_kg")
      .eq("lot_id", lot.id);

    if (!tiers || tiers.length === 0) continue;

    const effectivePrice = getTierProgress(
      {
        committed_quantity_kg: Number(lot.committed_quantity_kg || 0),
        price_per_kg: Number(lot.price_per_kg || 0),
        bag_size_kg: lot.bag_size_kg ?? null,
      },
      tiers.map((t) => ({
        min_bags: t.min_bags ?? null,
        min_quantity_kg: t.min_quantity_kg === null ? null : Number(t.min_quantity_kg),
        price_per_kg: Number(t.price_per_kg),
      }))
    ).currentPricePerKg;

    // No tier crossed — base price still applies
    if (effectivePrice >= lot.price_per_kg) continue;

    // Check idempotency: have we already notified at this price?
    const { data: existingNotification } = await admin
      .from("price_drop_notifications")
      .select("id")
      .eq("lot_id", lot.id)
      .eq("notified_price_per_kg", effectivePrice)
      .maybeSingle();

    if (existingNotification) continue;

    // Find buyers with active commitments (investors)
    const { data: commitments } = await admin
      .from("commitments")
      .select("buyer_id")
      .eq("lot_id", lot.id)
      .neq("status", "cancelled");

    const investorIds = new Set(
      (commitments || []).map((c) => c.buyer_id).filter(Boolean)
    );

    // Find all hubs that have this lot
    const { data: hubLots } = await admin
      .from("hub_lots")
      .select("hub_id, hubs!hub_lots_hub_id_fkey(id, name)")
      .eq("lot_id", lot.id);

    const hubIds = [...new Set((hubLots || []).map((hl) => hl.hub_id))];

    const emailPromises: Promise<unknown>[] = [];
    let investorCount = 0;
    let nonInvestorCount = 0;

    for (const hubId of hubIds) {
      const hubRecord = (hubLots || []).find((hl) => hl.hub_id === hubId);
      const hubName = (hubRecord?.hubs as { name?: string } | null)?.name || "your hub";

      const { data: members } = await admin
        .from("hub_members")
        .select("user_id, profiles:profiles!hub_members_user_id_fkey(id, email, contact_name)")
        .eq("hub_id", hubId)
        .eq("status", "active")
        .eq("role", "buyer")
        .not("user_id", "is", null);

      for (const member of members || []) {
        if (!member.user_id) continue;
        const profile = member.profiles as unknown as { id: string; email: string | null; contact_name: string | null } | null;
        if (!profile?.email) continue;

        const isInvestor = investorIds.has(member.user_id);

        if (!debug) {
          if (isInvestor) {
            investorCount += 1;
            emailPromises.push(
              sendPriceDropInvestorEmail({
                buyer: { email: profile.email, contact_name: profile.contact_name },
                lot: { id: lot.id, title: lot.title, price_per_kg: lot.price_per_kg },
                newPricePerKg: effectivePrice,
              }).catch(console.error)
            );
          } else {
            nonInvestorCount += 1;
            emailPromises.push(
              sendPriceDropNonInvestorEmail({
                buyer: { email: profile.email, contact_name: profile.contact_name },
                lot: {
                  id: lot.id,
                  title: lot.title,
                  price_per_kg: lot.price_per_kg,
                  commitment_deadline: lot.commitment_deadline,
                },
                newPricePerKg: effectivePrice,
                hubName,
              }).catch(console.error)
            );
          }
        } else {
          isInvestor ? (investorCount += 1) : (nonInvestorCount += 1);
        }
      }
    }

    if (!debug) {
      await Promise.allSettled(emailPromises);

      // Record that we notified at this price to prevent duplicates
      await admin
        .from("price_drop_notifications")
        .insert({ lot_id: lot.id, notified_price_per_kg: effectivePrice })
        .then(({ error }) => {
          if (error) console.error("Failed to record price_drop_notification:", error);
        });
    }

    results.push({
      lot_id: lot.id,
      title: lot.title,
      base_price: lot.price_per_kg,
      effective_price: effectivePrice,
      investor_emails: debug ? 0 : investorCount,
      non_investor_emails: debug ? 0 : nonInvestorCount,
      ...(debug
        ? { would_send_to_investors: investorCount, would_send_to_non_investors: nonInvestorCount }
        : {}),
    });
  }

  return NextResponse.json({ processed_lots: results.length, results }, { status: 200 });
}

export async function GET(request: Request) {
  return sendPriceDropNotifications(request);
}

export async function POST(request: Request) {
  return sendPriceDropNotifications(request);
}

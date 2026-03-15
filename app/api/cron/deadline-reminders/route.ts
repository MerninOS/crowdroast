import { createAdminClient } from "@/lib/supabase/admin";
import { sendDeadlineReminderEmail } from "@/lib/email";
import { NextResponse } from "next/server";

function getBearerToken(header: string | null) {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer") return null;
  return token || null;
}

/**
 * AC-8a: Lot deadline reminder — 24 hours before deadline.
 *
 * Queries active lots with a deadline 24–48 hours from now, then for each lot
 * finds buyers in the associated hub who have not yet committed, and sends them
 * a reminder email.
 *
 * Schedule suggestion (vercel.json): every hour — "0 * * * *"
 */
async function sendDeadlineReminders(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Missing CRON_SECRET" }, { status: 500 });
  }

  const bearer = getBearerToken(request.headers.get("authorization"));
  const headerSecret = request.headers.get("x-cron-secret");
  if (bearer !== cronSecret && headerSecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const debug = searchParams.get("debug") === "1";

  const admin = createAdminClient();
  const now = new Date();
  const windowStart = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h from now
  const windowEnd = new Date(now.getTime() + 48 * 60 * 60 * 1000);   // 48h from now

  const { data: lots, error: lotsError } = await admin
    .from("lots")
    .select("id, title, price_per_kg, currency, commitment_deadline")
    .in("status", ["active", "fully_committed"])
    .gte("commitment_deadline", windowStart.toISOString())
    .lte("commitment_deadline", windowEnd.toISOString());

  if (lotsError) {
    return NextResponse.json({ error: lotsError.message }, { status: 500 });
  }

  const results: Array<Record<string, unknown>> = [];

  for (const lot of lots || []) {
    // Find all hubs that have this lot in their catalog
    const { data: hubLots } = await admin
      .from("hub_lots")
      .select("hub_id, hubs!hub_lots_hub_id_fkey(id, name)")
      .eq("lot_id", lot.id);

    const hubIds = [...new Set((hubLots || []).map((hl) => hl.hub_id))];
    if (hubIds.length === 0) {
      results.push({ lot_id: lot.id, hubs_found: 0, reminders_sent: 0 });
      continue;
    }

    // Find buyers who have already committed to this lot
    const { data: existingCommitments } = await admin
      .from("commitments")
      .select("buyer_id")
      .eq("lot_id", lot.id)
      .neq("status", "cancelled");

    const committedBuyerIds = new Set(
      (existingCommitments || []).map((c) => c.buyer_id).filter(Boolean)
    );

    let remindersQueued = 0;
    const emailPromises: Promise<unknown>[] = [];

    for (const hubId of hubIds) {
      const hubRecord = (hubLots || []).find((hl) => hl.hub_id === hubId);
      const hubName =
        (hubRecord?.hubs as { name?: string } | null)?.name || "your hub";

      // Find active buyer members of this hub who haven't committed
      const { data: members } = await admin
        .from("hub_members")
        .select("user_id, profiles:profiles!hub_members_user_id_fkey(id, email, contact_name)")
        .eq("hub_id", hubId)
        .eq("status", "active")
        .eq("role", "buyer")
        .not("user_id", "is", null);

      for (const member of members || []) {
        if (!member.user_id || committedBuyerIds.has(member.user_id)) continue;
        const profile = member.profiles as unknown as { id: string; email: string | null; contact_name: string | null } | null;
        if (!profile?.email) continue;

        remindersQueued += 1;
        if (!debug) {
          emailPromises.push(
            sendDeadlineReminderEmail({
              buyer: { email: profile.email, contact_name: profile.contact_name },
              lot: {
                id: lot.id,
                title: lot.title,
                commitment_deadline: lot.commitment_deadline,
                price_per_kg: lot.price_per_kg,
              },
              hubName,
            }).catch(console.error)
          );
        }
      }
    }

    if (!debug) await Promise.allSettled(emailPromises);

    results.push({
      lot_id: lot.id,
      title: lot.title,
      deadline: lot.commitment_deadline,
      hubs_found: hubIds.length,
      reminders_sent: debug ? 0 : remindersQueued,
      ...(debug ? { would_send: remindersQueued } : {}),
    });
  }

  return NextResponse.json({ processed_lots: results.length, results }, { status: 200 });
}

export async function GET(request: Request) {
  return sendDeadlineReminders(request);
}

export async function POST(request: Request) {
  return sendDeadlineReminders(request);
}

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateInviteCode } from "@/lib/referrals/code";

// POST /api/invite-codes — get-or-create the caller's invite code.
//
// Idempotent: calling twice as the same authenticated buyer returns the same
// code. The hub on the returned code is the inviter's hub at the moment the
// code was first generated; if they later switch hubs, the snapshot stays
// (per spec criterion 4 false-positive — invitees still go to the snapshotted
// hub even if the inviter has moved on).
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Caller must be an active member of some hub. The share UI is gated on
  // this in the dashboard, but enforce server-side too.
  const { data: membership } = await supabase
    .from("hub_members")
    .select("hub_id, hub:hubs!hub_members_hub_id_fkey(id, name, city)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership) {
    return NextResponse.json(
      { error: "active_hub_membership_required" },
      { status: 403 }
    );
  }

  // Type assertion: the join always returns a single hub object since hub_id
  // is a non-null FK.
  const hub = membership.hub as unknown as { id: string; name: string; city: string | null };

  const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "";

  // Existing active code? Return it (idempotency).
  const { data: existing } = await supabase
    .from("invite_codes")
    .select("code")
    .eq("inviter_user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      code: existing.code,
      url: `${origin}/i/${existing.code}`,
      hubId: hub.id,
      hubName: hub.name,
      hubCity: hub.city,
    });
  }

  // Create a new one. The partial unique index on
  // (inviter_user_id WHERE revoked_at IS NULL) guards against duplicates if
  // two requests race; on collision, re-select and return the winner.
  const code = generateInviteCode();
  const { error: insertError } = await supabase.from("invite_codes").insert({
    code,
    inviter_user_id: user.id,
    hub_id: hub.id,
  });

  if (insertError) {
    // 23505 is unique_violation. Either our generated code collided (~51 bits
    // makes this astronomically unlikely) or another request beat us to the
    // partial unique on inviter_user_id. Either way, re-read.
    if (insertError.code === "23505") {
      const { data: winner } = await supabase
        .from("invite_codes")
        .select("code")
        .eq("inviter_user_id", user.id)
        .is("revoked_at", null)
        .maybeSingle();
      if (winner) {
        return NextResponse.json({
          code: winner.code,
          url: `${origin}/i/${winner.code}`,
          hubId: hub.id,
          hubName: hub.name,
          hubCity: hub.city,
        });
      }
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      code,
      url: `${origin}/i/${code}`,
      hubId: hub.id,
      hubName: hub.name,
      hubCity: hub.city,
    },
    { status: 201 }
  );
}

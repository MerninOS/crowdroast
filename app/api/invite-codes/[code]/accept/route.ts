import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// POST /api/invite-codes/[code]/accept — logged-in user joins the snapshotted
// hub on an invite_code. Branches per spec criteria 4 + 5:
//
//   already-member-of-this-hub  → 200 { already_member: true }
//   already-active-other-hub    → 409 { error: 'different_hub_active' }
//   self-invite                 → 400 { error: 'self_invite_not_allowed' }
//   hubless                     → insert hub_members row, 200
//
// The hub_members insert goes through the service-role client because the
// repo's hub_members RLS only lets hub owners insert; a buyer joining via a
// link is a buyer-initiated insert that owner-RLS doesn't cover.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Look up the invite. Service-role so revoked/missing codes 404 cleanly.
  const { data: invite } = await admin
    .from("invite_codes")
    .select("inviter_user_id, hub_id, revoked_at, hub:hubs!invite_codes_hub_id_fkey(name)")
    .eq("code", code)
    .maybeSingle();

  if (!invite || invite.revoked_at) {
    return NextResponse.json({ error: "invalid_or_revoked" }, { status: 404 });
  }

  // Self-invite (logged-in inviter clicks their own link).
  if (invite.inviter_user_id === user.id) {
    return NextResponse.json({ error: "self_invite_not_allowed" }, { status: 400 });
  }

  // Caller's existing active membership, if any.
  const { data: activeMembership } = await admin
    .from("hub_members")
    .select("hub_id, hub:hubs!hub_members_hub_id_fkey(name)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (activeMembership) {
    if (activeMembership.hub_id === invite.hub_id) {
      return NextResponse.json({ already_member: true });
    }
    const currentHub = activeMembership.hub as unknown as { name: string } | null;
    return NextResponse.json(
      {
        error: "different_hub_active",
        currentHubName: currentHub?.name ?? null,
      },
      { status: 409 }
    );
  }

  // Hubless caller — insert active membership attributed to the inviter.
  const { error: insertError } = await admin.from("hub_members").insert({
    hub_id: invite.hub_id,
    user_id: user.id,
    status: "active",
    role: "buyer",
    joined_at: new Date().toISOString(),
    invited_by_user_id: invite.inviter_user_id,
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Best-effort lock-once write of profile attribution. The trigger on
  // profiles.invited_by_user_id rejects overwrites, so wrapping this in a
  // catch-and-ignore handler keeps the accept-route succeeding even if the
  // user already had an inviter stamped from a prior signup-time path.
  await admin
    .from("profiles")
    .update({ invited_by_user_id: invite.inviter_user_id, invite_code_used: code })
    .eq("id", user.id)
    .is("invited_by_user_id", null)
    .then(() => undefined);

  const inviteHub = invite.hub as unknown as { name: string } | null;
  return NextResponse.json({
    joined: true,
    hubId: invite.hub_id,
    hubName: inviteHub?.name ?? null,
  });
}

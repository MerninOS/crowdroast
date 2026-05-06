import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// GET /api/referrals/me — inviter-facing list, grouped by status.
//
//   joined   — invitee signed up but hasn't reached charge_succeeded yet
//              (no referral_attributions row exists yet). Sourced from
//              profiles.invited_by_user_id directly so the inviter sees
//              their friend immediately on signup, not just after first
//              charge.
//   pending  — first charge succeeded, awaiting lot settle.
//   earned   — lot settled successfully, $10 credit landed.
//   voided   — lot failed; never paying out for this attribution.
//
// referral_attributions is RLS-scoped to inviter_user_id = auth.uid() so the
// cookie-bound client handles that. The joined-only query reads profiles
// scoped by invited_by_user_id; we use the service-role client there because
// the standard profile RLS doesn't grant a user read access to other users'
// profile rows. We constrain the read to invited_by_user_id = caller and
// only return contact_name / company_name — no PII like email.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: attributions, error: attrErr } = await supabase
    .from("referral_attributions")
    .select(
      `
      id, status, earned_at, created_at, invitee_user_id,
      invitee:profiles!referral_attributions_invitee_user_id_fkey(contact_name, company_name)
      `
    )
    .order("created_at", { ascending: false });

  if (attrErr) {
    return NextResponse.json({ error: attrErr.message }, { status: 500 });
  }

  type AttrRow = {
    id: string;
    status: "pending" | "earned" | "voided";
    earned_at: string | null;
    created_at: string;
    invitee_user_id: string;
    invitee: { contact_name: string | null; company_name: string | null } | null;
  };

  const attrRows = (attributions ?? []) as unknown as AttrRow[];
  const attributedInviteeIds = new Set(attrRows.map((r) => r.invitee_user_id));

  // Joined-but-not-yet-attributed: profiles where invited_by_user_id = me
  // AND no attribution row exists yet. Service-role read scoped to the
  // calling user's id at the WHERE clause.
  const admin = createAdminClient();
  const { data: invitedProfiles } = await admin
    .from("profiles")
    .select("id, contact_name, company_name, created_at")
    .eq("invited_by_user_id", user.id);

  type InvitedProfile = {
    id: string;
    contact_name: string | null;
    company_name: string | null;
    created_at: string;
  };

  type JoinedRow = {
    id: string;
    status: "joined";
    earned_at: null;
    created_at: string;
    invitee: { contact_name: string | null; company_name: string | null };
  };

  const joined: JoinedRow[] = ((invitedProfiles ?? []) as InvitedProfile[])
    .filter((p) => !attributedInviteeIds.has(p.id))
    .map((p) => ({
      id: p.id,
      status: "joined" as const,
      earned_at: null,
      created_at: p.created_at,
      invitee: { contact_name: p.contact_name, company_name: p.company_name },
    }));

  return NextResponse.json({
    joined,
    pending: attrRows.filter((r) => r.status === "pending"),
    earned: attrRows.filter((r) => r.status === "earned"),
    voided: attrRows.filter((r) => r.status === "voided"),
  });
}

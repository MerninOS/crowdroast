import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendReferralSignupEmail } from "@/lib/email";
import { NextResponse } from "next/server";

// POST /api/referrals/signup-notify — best-effort, idempotent helper that
// sends ReferralSignup to the inviter once per attributed user. The dashboard
// layout fires this on first load for any user who has invited_by_user_id
// set AND referral_signup_email_sent_at null.
//
// PG triggers can't emit email, so this is the v1 mechanism. The
// referral_signup_email_sent_at stamp on profiles makes it idempotent
// regardless of how many times the dashboard re-mounts.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Load the invitee's profile + the inviter we'd notify.
  const { data: invitee } = await admin
    .from("profiles")
    .select("contact_name, company_name, invited_by_user_id, referral_signup_email_sent_at")
    .eq("id", user.id)
    .maybeSingle();

  if (!invitee) {
    return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  }

  if (!invitee.invited_by_user_id || invitee.referral_signup_email_sent_at) {
    return NextResponse.json({ skipped: true });
  }

  const { data: inviter } = await admin
    .from("profiles")
    .select("email, contact_name")
    .eq("id", invitee.invited_by_user_id)
    .maybeSingle();

  // Best-effort: load the snapshotted hub on the invite_code so the email
  // names the right hub even if the inviter has since switched.
  const { data: membership } = await admin
    .from("hub_members")
    .select("hub:hubs!hub_members_hub_id_fkey(name)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  const hub = (membership?.hub as unknown as { name: string } | null) ?? null;

  if (inviter?.email && hub?.name) {
    await sendReferralSignupEmail({
      inviter: { email: inviter.email, contact_name: inviter.contact_name },
      invitee: { contact_name: invitee.contact_name, company_name: invitee.company_name },
      hubName: hub.name,
    }).catch(() => undefined);
  }

  // Stamp regardless — we don't want to retry on transient send failures
  // forever on every dashboard load. Manual admin re-send is the escape
  // hatch if delivery actually fails.
  await admin
    .from("profiles")
    .update({ referral_signup_email_sent_at: new Date().toISOString() })
    .eq("id", user.id);

  return NextResponse.json({ sent: true });
}

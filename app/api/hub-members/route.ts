import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBuyerJoinedHubEmail, sendBuyerHubInviteEmail } from "@/lib/email";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const hubId = typeof body?.hub_id === "string" ? body.hub_id : "";
  const inviteEmail = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!hubId || !inviteEmail || !inviteEmail.includes("@")) {
    return NextResponse.json({ error: "hub_id and a valid email are required" }, { status: 400 });
  }

  // Verify caller is hub owner of this hub
  const { data: hub } = await supabase
    .from("hubs")
    .select("id, name")
    .eq("id", hubId)
    .eq("owner_id", user.id)
    .single();

  if (!hub) {
    return NextResponse.json(
      { error: "Hub not found or you are not the owner" },
      { status: 403 }
    );
  }

  // Look up existing buyer profile by email
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id, role, contact_name, company_name, email")
    .eq("email", inviteEmail)
    .single();

  if (existingProfile && existingProfile.role !== "buyer") {
    return NextResponse.json({ error: "Only buyers can be added to a hub" }, { status: 400 });
  }

  // Check for duplicate membership
  const { data: existing } = await supabase
    .from("hub_members")
    .select("id")
    .eq("hub_id", hubId)
    .or(
      existingProfile
        ? `user_id.eq.${existingProfile.id}`
        : `invited_email.eq.${inviteEmail}`
    )
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "This person is already a member of this hub" }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("hub_members")
    .insert({
      hub_id: hubId,
      user_id: existingProfile?.id || null,
      invited_email: inviteEmail,
      role: "buyer",
      status: existingProfile ? "active" : "invited",
    })
    .select("*, profile:profiles!hub_members_user_id_fkey(id, contact_name, company_name, email)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Cancel any pending hub access requests for this buyer (criterion 10)
  if (existingProfile) {
    const adminClient = createAdminClient();
    await adminClient
      .from("hub_access_requests")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("user_id", existingProfile.id)
      .eq("status", "pending");
  }

  // Send invite email to new users who don't have an account yet
  if (!existingProfile) {
    const { data: hubOwnerProfile } = await supabase
      .from("profiles")
      .select("contact_name, company_name")
      .eq("id", user.id)
      .single();

    const invitedByName =
      hubOwnerProfile?.contact_name ||
      hubOwnerProfile?.company_name ||
      "A hub owner";

    await sendBuyerHubInviteEmail({
      recipientEmail: inviteEmail,
      invitedByName,
      hubName: hub.name,
    }).catch(console.error);
  }

  // AC-3: notify hub owner when an existing buyer joins immediately
  if (existingProfile) {
    const { data: hubOwnerProfile } = await supabase
      .from("profiles")
      .select("email, contact_name")
      .eq("id", user.id)
      .single();

    if (hubOwnerProfile) {
      await sendBuyerJoinedHubEmail({
        hubOwner: hubOwnerProfile,
        buyer: {
          contact_name: existingProfile.contact_name,
          company_name: existingProfile.company_name,
        },
        hubName: hub.name,
      }).catch(console.error);
    }
  }

  return NextResponse.json(data, { status: 201 });
}

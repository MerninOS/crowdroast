import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendHubAccessApprovedEmail, sendHubAccessDeniedEmail } from "@/lib/email";
import { NextResponse } from "next/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const action = body?.action;

  if (action !== "approve" && action !== "deny") {
    return NextResponse.json(
      { error: 'action must be "approve" or "deny"' },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();

  // Fetch the request with hub and buyer info
  const { data: accessRequest } = await adminClient
    .from("hub_access_requests")
    .select("*, hub:hubs!hub_access_requests_hub_id_fkey(id, name, owner_id)")
    .eq("id", id)
    .single();

  if (!accessRequest) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const hub = Array.isArray(accessRequest.hub)
    ? accessRequest.hub[0]
    : accessRequest.hub;

  // Verify caller is the hub owner
  if (hub.owner_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Idempotent: if already processed, return current state
  if (accessRequest.status !== "pending") {
    return NextResponse.json({
      message: `Request already ${accessRequest.status}`,
      status: accessRequest.status,
    });
  }

  // Fetch buyer profile for emails
  const { data: buyer } = await adminClient
    .from("profiles")
    .select("id, email, contact_name, company_name")
    .eq("id", accessRequest.user_id)
    .single();

  if (action === "approve") {
    // Update request status
    await adminClient
      .from("hub_access_requests")
      .update({ status: "approved", updated_at: new Date().toISOString() })
      .eq("id", id);

    // Create hub_member record
    const { error: memberError } = await adminClient
      .from("hub_members")
      .insert({
        hub_id: hub.id,
        user_id: accessRequest.user_id,
        role: "buyer",
        status: "active",
      });

    if (memberError) {
      // Roll back the request status if member creation fails
      await adminClient
        .from("hub_access_requests")
        .update({ status: "pending", updated_at: new Date().toISOString() })
        .eq("id", id);

      return NextResponse.json(
        { error: memberError.message },
        { status: 500 }
      );
    }

    // Cancel any other pending requests for this buyer
    await adminClient
      .from("hub_access_requests")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("user_id", accessRequest.user_id)
      .eq("status", "pending")
      .neq("id", id);

    // Send approval email
    if (buyer) {
      await sendHubAccessApprovedEmail({
        buyer: { email: buyer.email, contact_name: buyer.contact_name },
        hubName: hub.name,
      }).catch(console.error);
    }

    return NextResponse.json({ message: "Request approved", status: "approved" });
  }

  // Deny
  await adminClient
    .from("hub_access_requests")
    .update({ status: "denied", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (buyer) {
    await sendHubAccessDeniedEmail({
      buyer: { email: buyer.email, contact_name: buyer.contact_name },
      hubName: hub.name,
    }).catch(console.error);
  }

  return NextResponse.json({ message: "Request denied", status: "denied" });
}

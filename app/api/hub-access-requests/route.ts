import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendHubAccessRequestEmail } from "@/lib/email";
import { NextResponse } from "next/server";

const COOLDOWN_DAYS = 7;

// GET: buyer's own hub access requests
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("hub_access_requests")
    .select("*, hub:hubs!hub_access_requests_hub_id_fkey(id, name, address, city, state, country)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST: buyer creates a new request
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify caller is a buyer
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, contact_name, company_name, email")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "buyer") {
    return NextResponse.json({ error: "Only buyers can request hub access" }, { status: 403 });
  }

  const body = await request.json();
  const hubId = typeof body?.hub_id === "string" ? body.hub_id : "";

  if (!hubId) {
    return NextResponse.json({ error: "hub_id is required" }, { status: 400 });
  }

  // Verify hub exists and is active
  const { data: hub } = await supabase
    .from("hubs")
    .select("id, name, owner_id")
    .eq("id", hubId)
    .eq("is_active", true)
    .single();

  if (!hub) {
    return NextResponse.json({ error: "Hub not found or inactive" }, { status: 404 });
  }

  // Check if buyer is already in a hub
  const adminClient = createAdminClient();
  const { data: activeMembership } = await adminClient
    .from("hub_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (activeMembership) {
    return NextResponse.json({ error: "You are already a member of a hub" }, { status: 409 });
  }

  // Check for existing pending request
  const { data: pendingRequest } = await adminClient
    .from("hub_access_requests")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .maybeSingle();

  if (pendingRequest) {
    return NextResponse.json({ error: "You already have a pending request" }, { status: 409 });
  }

  // Check 7-day cooldown for same hub after denial
  const { data: recentDenial } = await adminClient
    .from("hub_access_requests")
    .select("id, updated_at")
    .eq("user_id", user.id)
    .eq("hub_id", hubId)
    .eq("status", "denied")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recentDenial) {
    const deniedAt = new Date(recentDenial.updated_at).getTime();
    const cooldownMs = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
    if (Date.now() - deniedAt < cooldownMs) {
      return NextResponse.json(
        { error: "You must wait 7 days before re-requesting this hub" },
        { status: 429 }
      );
    }
  }

  // Create the request
  const { data: accessRequest, error } = await adminClient
    .from("hub_access_requests")
    .insert({
      hub_id: hubId,
      user_id: user.id,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Send email to hub owner
  const { data: hubOwner } = await adminClient
    .from("profiles")
    .select("email, contact_name")
    .eq("id", hub.owner_id)
    .single();

  if (hubOwner) {
    await sendHubAccessRequestEmail({
      hubOwner,
      buyer: {
        contact_name: profile.contact_name,
        company_name: profile.company_name,
        email: profile.email,
      },
      hubName: hub.name,
    }).catch(console.error);
  }

  return NextResponse.json(accessRequest, { status: 201 });
}

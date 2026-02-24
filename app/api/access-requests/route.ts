import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_ROLES = new Set(["seller", "hub_owner"]);

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("role_access_requests")
    .select("id, requested_role, company_name, contact_name, phone, notes, status, reviewed_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, email")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "buyer") {
    return NextResponse.json(
      { error: "Only buyers can submit role access requests" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const requestedRole = typeof body?.requested_role === "string" ? body.requested_role : "";
  const companyName = typeof body?.company_name === "string" ? body.company_name.trim() : null;
  const contactName = typeof body?.contact_name === "string" ? body.contact_name.trim() : null;
  const phone = typeof body?.phone === "string" ? body.phone.trim() : null;
  const notes = typeof body?.notes === "string" ? body.notes.trim() : null;

  if (!ALLOWED_ROLES.has(requestedRole)) {
    return NextResponse.json({ error: "Invalid requested_role" }, { status: 400 });
  }

  const { data: existingPending } = await supabase
    .from("role_access_requests")
    .select("id")
    .eq("user_id", user.id)
    .eq("requested_role", requestedRole)
    .eq("status", "pending")
    .maybeSingle();

  if (existingPending) {
    return NextResponse.json(
      { error: "You already have a pending request for this role" },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from("role_access_requests")
    .insert({
      user_id: user.id,
      email: profile?.email || user.email || "",
      requested_role: requestedRole,
      company_name: companyName || null,
      contact_name: contactName || null,
      phone: phone || null,
      notes: notes || null,
      status: "pending",
    })
    .select("id, requested_role, company_name, contact_name, phone, notes, status, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

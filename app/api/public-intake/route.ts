import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED_ROLES = new Set(["seller", "hub_owner"]);

// NOTE: This endpoint assumes role_access_requests.user_id is nullable.
// If a NOT NULL constraint error is returned from Supabase, the schema must be
// updated to allow null user_id before this endpoint will work correctly.
// Do NOT work around this constraint — fix it at the schema level.

// TODO: Add rate limiting (e.g. IP-based via Vercel middleware) before heavy production traffic.
// This is a public unauthenticated endpoint — spam submissions are possible.
export async function POST(request: Request) {
  const body = await request.json();

  const requestedRole =
    typeof body?.requested_role === "string" ? body.requested_role : "";

  if (!ALLOWED_ROLES.has(requestedRole)) {
    return NextResponse.json(
      { error: "Invalid requested_role. Must be 'seller' or 'hub_owner'." },
      { status: 400 }
    );
  }

  const email =
    typeof body?.email === "string" ? body.email.trim() : "";

  if (!email) {
    return NextResponse.json(
      { error: "email is required." },
      { status: 400 }
    );
  }

  const companyName =
    typeof body?.company_name === "string" ? body.company_name.trim() || null : null;
  const contactName =
    typeof body?.contact_name === "string" ? body.contact_name.trim() || null : null;
  const phone =
    typeof body?.phone === "string" ? body.phone.trim() || null : null;
  const notes =
    typeof body?.notes === "string" ? body.notes.trim() || null : null;

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("role_access_requests")
    .insert({
      user_id: null,
      email: email,
      requested_role: requestedRole,
      company_name: companyName,
      contact_name: contactName,
      phone: phone,
      notes: notes,
      status: "pending",
    })
    .select("id, requested_role, company_name, contact_name, phone, notes, status, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

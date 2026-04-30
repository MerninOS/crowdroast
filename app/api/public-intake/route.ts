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
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  // Basic shape + length checks. This endpoint is unauthenticated, so reject
  // obvious garbage before it reaches the database.
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json(
      { error: "A valid email is required." },
      { status: 400 }
    );
  }

  const trimToLength = (value: unknown, max: number): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, max);
  };

  const companyName = trimToLength(body?.company_name, 200);
  const contactName = trimToLength(body?.contact_name, 200);
  const phone = trimToLength(body?.phone, 50);
  const notes = trimToLength(body?.notes, 2000);

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

import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// GET /api/invite-codes/[code] — public lookup powering the landing page.
//
// Logged-out visitors must be able to load the landing page, so this route
// uses the service-role client. We return only the small set of fields the
// landing page actually renders: inviter contact_name, hub name + city, and
// the code itself for echo-back. Nothing PII-sensitive.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("invite_codes")
    .select(
      `
      code,
      revoked_at,
      hub:hubs!invite_codes_hub_id_fkey(id, name, city),
      inviter:profiles!invite_codes_inviter_user_id_fkey(contact_name)
      `
    )
    .eq("code", code)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data || data.revoked_at) {
    return NextResponse.json({ error: "invalid_or_revoked" }, { status: 404 });
  }

  const hub = data.hub as unknown as { id: string; name: string; city: string | null } | null;
  const inviter = data.inviter as unknown as { contact_name: string | null } | null;

  if (!hub) {
    // FK is non-null on insert, but the hub could have been hard-deleted.
    return NextResponse.json({ error: "invalid_or_revoked" }, { status: 404 });
  }

  return NextResponse.json({
    code: data.code,
    inviterName: inviter?.contact_name ?? null,
    hubId: hub.id,
    hubName: hub.name,
    hubCity: hub.city,
  });
}

import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/auth/admin-route";

const VALID_STATUSES = new Set(["pending", "approved", "rejected"]);

export async function GET() {
  const ctx = await requireAdminContext();
  if ("error" in ctx) return ctx.error;

  const { data, error } = await ctx.admin
    .from("role_access_requests")
    .select(
      "id, user_id, email, requested_role, company_name, contact_name, phone, notes, status, reviewed_by, reviewed_at, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

export async function PATCH(request: Request) {
  const ctx = await requireAdminContext();
  if ("error" in ctx) return ctx.error;

  const body = await request.json();
  const requestId = typeof body?.request_id === "string" ? body.request_id : "";
  const status = typeof body?.status === "string" ? body.status : "";

  if (!requestId || !VALID_STATUSES.has(status)) {
    return NextResponse.json(
      { error: "request_id and a valid status are required" },
      { status: 400 }
    );
  }

  const { data: row, error: findError } = await ctx.admin
    .from("role_access_requests")
    .select("id, user_id, requested_role")
    .eq("id", requestId)
    .single();

  if (findError || !row) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const { error: updateRequestError } = await ctx.admin
    .from("role_access_requests")
    .update({
      status,
      reviewed_by: ctx.user.id,
      reviewed_at: now,
      updated_at: now,
    })
    .eq("id", requestId);

  if (updateRequestError) {
    return NextResponse.json({ error: updateRequestError.message }, { status: 500 });
  }

  if (status === "approved") {
    const { error: updateProfileError } = await ctx.admin
      .from("profiles")
      .update({
        role: row.requested_role,
        updated_at: now,
      })
      .eq("id", row.user_id);

    if (updateProfileError) {
      return NextResponse.json({ error: updateProfileError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

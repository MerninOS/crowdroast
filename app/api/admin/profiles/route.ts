import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/auth/admin-route";
import { isAdminAccount } from "@/lib/auth/admin";

const ALLOWED_ROLES = new Set(["buyer", "seller", "hub_owner"]);

export async function GET() {
  const ctx = await requireAdminContext();
  if ("error" in ctx) return ctx.error;

  const { data, error } = await ctx.admin
    .from("profiles")
    .select("id, email, contact_name, company_name, role, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data || []).filter(
    (profile) => !isAdminAccount({ email: profile.email, role: profile.role })
  );
  return NextResponse.json(rows);
}

export async function PATCH(request: Request) {
  const ctx = await requireAdminContext();
  if ("error" in ctx) return ctx.error;

  const body = await request.json();
  const userId = typeof body?.user_id === "string" ? body.user_id : "";
  const role = typeof body?.role === "string" ? body.role : "";

  if (!userId || !ALLOWED_ROLES.has(role)) {
    return NextResponse.json(
      { error: "user_id and a valid role are required" },
      { status: 400 }
    );
  }

  const { data: target, error: targetError } = await ctx.admin
    .from("profiles")
    .select("id, email, role")
    .eq("id", userId)
    .single();

  if (targetError || !target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (isAdminAccount({ email: target.email, role: target.role })) {
    return NextResponse.json(
      { error: "Admin account role cannot be changed" },
      { status: 400 }
    );
  }

  const { error: profileError } = await ctx.admin
    .from("profiles")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

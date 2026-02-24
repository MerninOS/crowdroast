import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/auth/admin-route";

const ALLOWED_TARGET_ROLES = new Set(["seller", "hub_owner"]);

export async function GET() {
  const ctx = await requireAdminContext();
  if ("error" in ctx) return ctx.error;

  const { data, error } = await ctx.admin
    .from("role_invitations")
    .select("id, email, target_role, company_name, contact_name, message, status, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const ctx = await requireAdminContext();
  if ("error" in ctx) return ctx.error;

  const body = await request.json();
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const targetRole = typeof body?.target_role === "string" ? body.target_role : "";
  const companyName = typeof body?.company_name === "string" ? body.company_name.trim() : null;
  const contactName = typeof body?.contact_name === "string" ? body.contact_name.trim() : null;
  const message = typeof body?.message === "string" ? body.message.trim() : null;

  if (!email || !email.includes("@") || !ALLOWED_TARGET_ROLES.has(targetRole)) {
    return NextResponse.json(
      { error: "A valid email and target_role are required" },
      { status: 400 }
    );
  }

  const { data: existingPending } = await ctx.admin
    .from("role_invitations")
    .select("id")
    .eq("email", email)
    .eq("target_role", targetRole)
    .eq("status", "pending")
    .maybeSingle();

  if (existingPending) {
    return NextResponse.json(
      { error: "A pending invitation already exists for this email and role" },
      { status: 409 }
    );
  }

  const { data, error } = await ctx.admin
    .from("role_invitations")
    .insert({
      email,
      target_role: targetRole,
      invited_by: ctx.user.id,
      company_name: companyName || null,
      contact_name: contactName || null,
      message: message || null,
      status: "pending",
    })
    .select("id, email, target_role, company_name, contact_name, message, status, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

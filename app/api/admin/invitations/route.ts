import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/auth/admin-route";
import { sendSellerInviteEmail } from "@/lib/email";

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

  // AC-1c: silently skip if already invited (no error, no email)
  if (existingPending) {
    return NextResponse.json({ skipped: true }, { status: 200 });
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

  // AC-1: send invitation email; surface delivery failure to the caller
  if (targetRole === "seller") {
    const inviterName =
      contactName ||
      companyName ||
      ctx.user.email ||
      "CrowdRoast";
    const emailResult = await sendSellerInviteEmail({
      recipientEmail: email,
      invitedByName: inviterName,
    });
    if (!emailResult.success) {
      return NextResponse.json(
        { ...data, email_error: emailResult.error },
        { status: 201 }
      );
    }
  }

  return NextResponse.json(data, { status: 201 });
}

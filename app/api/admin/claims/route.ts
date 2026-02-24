import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/auth/admin-route";

const ALLOWED_STATUSES = new Set(["open", "under_review", "resolved", "rejected"]);

export async function GET() {
  const ctx = await requireAdminContext();
  if ("error" in ctx) return ctx.error;

  const { data, error } = await ctx.admin
    .from("claims")
    .select(
      "id, commitment_id, filed_by, type, description, status, resolution, created_at, handled_by, handled_at, commitment:commitments!claims_commitment_id_fkey(id, lot_id, total_price, lot:lots!commitments_lot_id_fkey(title)), filer:profiles!claims_filed_by_fkey(company_name, contact_name, email)"
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
  const claimId = typeof body?.claim_id === "string" ? body.claim_id : "";
  const status = typeof body?.status === "string" ? body.status : "";
  const resolution =
    typeof body?.resolution === "string" && body.resolution.trim().length > 0
      ? body.resolution.trim()
      : null;

  if (!claimId || !ALLOWED_STATUSES.has(status)) {
    return NextResponse.json(
      { error: "claim_id and a valid status are required" },
      { status: 400 }
    );
  }

  if ((status === "resolved" || status === "rejected") && !resolution) {
    return NextResponse.json(
      { error: "resolution is required when resolving or rejecting a claim" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const updates: Record<string, string | null> = {
    status,
    updated_at: now,
    handled_by: ctx.user.id,
    handled_at: now,
  };

  if (resolution !== null) {
    updates.resolution = resolution;
  }

  const { error } = await ctx.admin
    .from("claims")
    .update(updates)
    .eq("id", claimId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

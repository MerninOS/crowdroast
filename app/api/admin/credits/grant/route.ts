import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/auth/admin-route";

// POST /api/admin/credits/grant — admin-only credit ledger insert with reason
// 'admin_adjust'. Negative amounts are accepted (admins can deduct). The
// granted_by_admin_id and note are required for the audit trail — every
// admin_adjust row carries the admin who created it.
export async function POST(request: Request) {
  const ctx = await requireAdminContext();
  if (ctx.error) return ctx.error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const userId = typeof body.user_id === "string" ? body.user_id : "";
  const amountCents = typeof body.amount_cents === "number" ? body.amount_cents : NaN;
  const note = typeof body.note === "string" ? body.note : null;

  if (!userId) {
    return NextResponse.json({ error: "user_id_required" }, { status: 400 });
  }
  if (!Number.isInteger(amountCents) || amountCents === 0) {
    return NextResponse.json({ error: "amount_cents_must_be_nonzero_integer" }, { status: 400 });
  }

  // Confirm the target profile exists. The admin client doesn't need this
  // for the FK to fire, but a friendly 404 beats a Postgres error string.
  const { data: target } = await ctx.admin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (!target) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  const { data: row, error } = await ctx.admin
    .from("credit_ledger")
    .insert({
      user_id: userId,
      amount_cents: amountCents,
      reason: "admin_adjust",
      granted_by_admin_id: ctx.user.id,
      note,
    })
    .select("id, amount_cents, reason, granted_by_admin_id, note, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Compute the new balance for the success-toast.
  const { data: ledger } = await ctx.admin
    .from("credit_ledger")
    .select("amount_cents")
    .eq("user_id", userId);

  const balance_cents = (ledger ?? []).reduce(
    (sum: number, r: { amount_cents: number }) => sum + r.amount_cents,
    0
  );

  return NextResponse.json({ ledger_row: row, balance_cents }, { status: 201 });
}

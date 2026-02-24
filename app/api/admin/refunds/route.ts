import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/auth/admin-route";
import { createRefund } from "@/lib/stripe";

const REFUND_REASONS = new Set(["duplicate", "fraudulent", "requested_by_customer"]);

export async function GET() {
  const ctx = await requireAdminContext();
  if ("error" in ctx) return ctx.error;

  const { data, error } = await ctx.admin
    .from("commitments")
    .select(
      "id, lot_id, buyer_id, status, payment_status, total_price, charge_amount_cents, charge_currency, stripe_payment_intent_id, refund_status, refunded_amount_cents, refunded_at, refund_reason, created_at, buyer:profiles!commitments_buyer_id_fkey(company_name, contact_name, email), lot:lots!commitments_lot_id_fkey(title)"
    )
    .not("stripe_payment_intent_id", "is", null)
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
  const commitmentId = typeof body?.commitment_id === "string" ? body.commitment_id : "";
  const amountCents =
    typeof body?.amount_cents === "number" && Number.isFinite(body.amount_cents)
      ? Math.floor(body.amount_cents)
      : null;
  const reason =
    typeof body?.reason === "string" && REFUND_REASONS.has(body.reason)
      ? (body.reason as "duplicate" | "fraudulent" | "requested_by_customer")
      : "requested_by_customer";

  if (!commitmentId) {
    return NextResponse.json({ error: "commitment_id is required" }, { status: 400 });
  }

  const { data: commitment, error: commitmentError } = await ctx.admin
    .from("commitments")
    .select(
      "id, status, payment_status, charge_amount_cents, stripe_payment_intent_id, refunded_amount_cents"
    )
    .eq("id", commitmentId)
    .single();

  if (commitmentError || !commitment) {
    return NextResponse.json({ error: "Commitment not found" }, { status: 404 });
  }

  if (!commitment.stripe_payment_intent_id) {
    return NextResponse.json(
      { error: "This commitment has no payment intent to refund" },
      { status: 400 }
    );
  }

  const totalCharged = Number(commitment.charge_amount_cents || 0);
  const alreadyRefunded = Number(commitment.refunded_amount_cents || 0);
  const remaining = Math.max(0, totalCharged - alreadyRefunded);

  if (totalCharged <= 0 || remaining <= 0) {
    return NextResponse.json(
      { error: "No refundable amount is remaining for this commitment" },
      { status: 400 }
    );
  }

  const refundAmount = amountCents ?? remaining;
  if (!Number.isFinite(refundAmount) || refundAmount <= 0 || refundAmount > remaining) {
    return NextResponse.json(
      { error: `amount_cents must be between 1 and ${remaining}` },
      { status: 400 }
    );
  }

  try {
    const refund = await createRefund({
      paymentIntentId: commitment.stripe_payment_intent_id,
      commitmentId,
      amountCents: refundAmount,
      reason,
      idempotencySuffix: `admin-${Date.now()}`,
    });

    const refundedTotal = alreadyRefunded + refundAmount;
    const fullyRefunded = refundedTotal >= totalCharged;
    const now = new Date().toISOString();

    const { data: updated, error: updateError } = await ctx.admin
      .from("commitments")
      .update({
        payment_status: fullyRefunded ? "cancelled" : commitment.payment_status,
        refund_status: fullyRefunded ? "full" : "partial",
        refunded_amount_cents: refundedTotal,
        refunded_at: now,
        refunded_by: ctx.user.id,
        last_refund_id: refund.id,
        refund_reason: reason,
        updated_at: now,
      })
      .eq("id", commitmentId)
      .select(
        "id, lot_id, buyer_id, status, payment_status, total_price, charge_amount_cents, charge_currency, stripe_payment_intent_id, refund_status, refunded_amount_cents, refunded_at, refund_reason, created_at, buyer:profiles!commitments_buyer_id_fkey(company_name, contact_name, email), lot:lots!commitments_lot_id_fkey(title)"
      )
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    const now = new Date().toISOString();
    await ctx.admin
      .from("commitments")
      .update({
        refund_status: "failed",
        updated_at: now,
      })
      .eq("id", commitmentId);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Refund failed" },
      { status: 500 }
    );
  }
}

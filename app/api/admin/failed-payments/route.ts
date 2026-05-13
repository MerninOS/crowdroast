import { NextResponse } from "next/server";
import { requireAdminContext } from "@/lib/auth/admin-route";
import { recordOpsAction, type OpsActionKind } from "@/lib/admin/ops-actions";
import { transferOutBagIfReady } from "@/lib/bag-transfer-out";
import { sendSettlementEmailIfReady } from "@/lib/settlement-email-trigger";

// GET /api/admin/failed-payments
// Lists every commitment_bag_charges row in 'payment_failed' status, joined to
// commitment + lot + buyer profile. Drives the ops dashboard table (AC14).
//
// POST /api/admin/failed-payments
// Body: { charge_id: string, action: OpsActionKind, notes?: string }
// Performs one of four manual remediation actions against a single failed row
// and writes a paired ops_actions audit entry. All actions are idempotent in
// the sense that a re-submit against an already-resolved row returns 409.
//
// AUTH: requireAdminContext gates both methods. There is no public path to
// either handler. The admin layout at app/dashboard/admin/layout.tsx also
// blocks the page itself, but each route enforces the gate again — defense in
// depth, matches every other /api/admin/* route in this codebase.

const ACTION_KINDS: ReadonlyArray<OpsActionKind> = [
  "retry_charge",
  "mark_covered_by_platform",
  "mark_covered_by_hub",
  "cancel_bag_portion",
] as const;

function isOpsActionKind(value: unknown): value is OpsActionKind {
  return typeof value === "string" && (ACTION_KINDS as readonly string[]).includes(value);
}

export async function GET() {
  const ctx = await requireAdminContext();
  if ("error" in ctx) return ctx.error!;

  // The schema (migration #38) doesn't ship a FK-driven nested select for
  // commitments → lots → profiles. Fetch the failed rows first, then resolve
  // their joins with a small set of follow-up queries. This keeps the query
  // legible at the cost of one extra round-trip — fine for an ops dashboard.
  const { data: failedRows, error: failedErr } = await ctx.admin
    .from("commitment_bag_charges")
    .select(
      "id, commitment_id, bag_number, kg, amount_cents, attempt_count, failed_reason, created_at, payment_status"
    )
    .eq("payment_status", "payment_failed")
    .order("created_at", { ascending: false });

  if (failedErr) {
    return NextResponse.json({ error: failedErr.message }, { status: 500 });
  }

  const rows = failedRows ?? [];
  if (rows.length === 0) {
    return NextResponse.json([]);
  }

  const commitmentIds = Array.from(new Set(rows.map((row) => row.commitment_id)));

  const { data: commitments, error: commitErr } = await ctx.admin
    .from("commitments")
    .select("id, buyer_id, lot_id, quantity_kg")
    .in("id", commitmentIds);

  if (commitErr) {
    return NextResponse.json({ error: commitErr.message }, { status: 500 });
  }

  const commitmentsById = new Map((commitments ?? []).map((c) => [c.id, c]));
  const buyerIds = Array.from(
    new Set((commitments ?? []).map((c) => c.buyer_id).filter((id): id is string => Boolean(id)))
  );
  const lotIds = Array.from(
    new Set((commitments ?? []).map((c) => c.lot_id).filter((id): id is string => Boolean(id)))
  );

  const [{ data: profiles }, { data: lots }] = await Promise.all([
    ctx.admin
      .from("profiles")
      .select("id, email, contact_name, company_name")
      .in("id", buyerIds.length > 0 ? buyerIds : ["00000000-0000-0000-0000-000000000000"]),
    ctx.admin
      .from("lots")
      .select("id, title, seller_id")
      .in("id", lotIds.length > 0 ? lotIds : ["00000000-0000-0000-0000-000000000000"]),
  ]);

  const profilesById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const lotsById = new Map((lots ?? []).map((l) => [l.id, l]));

  const enriched = rows.map((row) => {
    const commitment = commitmentsById.get(row.commitment_id);
    const buyer = commitment?.buyer_id ? profilesById.get(commitment.buyer_id) : null;
    const lot = commitment?.lot_id ? lotsById.get(commitment.lot_id) : null;
    return {
      id: row.id,
      commitment_id: row.commitment_id,
      bag_number: row.bag_number,
      kg: row.kg,
      amount_cents: row.amount_cents,
      attempt_count: row.attempt_count,
      failed_reason: row.failed_reason,
      created_at: row.created_at,
      payment_status: row.payment_status,
      buyer: buyer
        ? {
            id: buyer.id,
            email: buyer.email,
            contact_name: buyer.contact_name,
            company_name: buyer.company_name,
          }
        : null,
      lot: lot ? { id: lot.id, title: lot.title, seller_id: lot.seller_id } : null,
    };
  });

  return NextResponse.json(enriched);
}

export async function POST(request: Request) {
  const ctx = await requireAdminContext();
  if ("error" in ctx) return ctx.error!;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const chargeId = typeof body.charge_id === "string" ? body.charge_id : "";
  const action = body.action;
  const notes = typeof body.notes === "string" ? body.notes : null;

  if (!chargeId) {
    return NextResponse.json({ error: "charge_id is required" }, { status: 400 });
  }
  if (!isOpsActionKind(action)) {
    return NextResponse.json(
      { error: `action must be one of: ${ACTION_KINDS.join(", ")}` },
      { status: 400 }
    );
  }

  // Load the row first. We refuse to act on anything not in 'payment_failed'.
  // The CHECK constraint on payment_status (migration #38) does NOT include
  // 'cancelled' — see the option-(b) decision in the task notes. A cancelled
  // row is encoded as payment_failed + an ops_actions row of kind
  // cancel_bag_portion, not as a distinct payment_status value.
  const { data: row, error: rowErr } = await ctx.admin
    .from("commitment_bag_charges")
    .select("id, commitment_id, bag_number, payment_status, amount_cents, attempt_count")
    .eq("id", chargeId)
    .maybeSingle();

  if (rowErr) {
    return NextResponse.json({ error: rowErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "charge_not_found" }, { status: 404 });
  }
  if (row.payment_status !== "payment_failed") {
    return NextResponse.json(
      { error: `charge is in '${row.payment_status}', not 'payment_failed'` },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  let nextStatus = row.payment_status as string;
  let updatePatch: Record<string, unknown> = { updated_at: now };
  let metadata: Record<string, unknown> = {};

  if (action === "retry_charge") {
    // Flip the row back so the charge worker picks it up on its next tick.
    // We reset next_attempt_at to now so the worker queue query (see
    // migration #38 worker_queue index comment) sees it immediately. We do
    // NOT bump attempt_count — Stripe's idempotency key plus the worker's
    // own decline-handling will increment it on the next real attempt.
    nextStatus = "awaiting_charge";
    updatePatch = {
      ...updatePatch,
      payment_status: "awaiting_charge",
      next_attempt_at: now,
      failed_reason: null,
    };
    metadata = { reset_from_attempt_count: row.attempt_count };
  } else if (action === "mark_covered_by_platform" || action === "mark_covered_by_hub") {
    // Cover actions: the bag still ships; ops decided someone-other-than-the
    // buyer eats the cost. The row transitions to 'charged' so downstream
    // settlement (Task 4.11 transfer-out) treats it as resolved. The audit
    // row records the cover so an auditor can later reconstruct who paid.
    nextStatus = "charged";
    updatePatch = {
      ...updatePatch,
      payment_status: "charged",
      failed_reason: null,
    };
    metadata = { amount_covered_cents: row.amount_cents };
  } else if (action === "cancel_bag_portion") {
    // Option (b) per task 4.10b decision: the CHECK constraint on
    // commitment_bag_charges.payment_status does NOT include 'cancelled'.
    // Rather than block on a migration, we leave the row in 'payment_failed'
    // and record the cancellation entirely in the ops_actions audit. The
    // bag-portion is considered terminally unrecoverable; readers must check
    // ops_actions for a cancel_bag_portion entry against the row to know it
    // was explicitly cancelled rather than passively failed.
    nextStatus = "payment_failed";
    // No payment_status change — row stays payment_failed. We still touch
    // updated_at so the row's last-touched stamp reflects the ops action.
    metadata = { cancelled_amount_cents: row.amount_cents };
  }

  // Order: if the row needs updating, do it first. Audit write second so the
  // audit only fires when the state change actually landed. Both writes are
  // service-role — RLS is not the gate here, the route handler is.
  if (Object.keys(updatePatch).length > 1) {
    // (more than just updated_at)
    // Use .select().maybeSingle() so we can detect zero-rowcount — another
    // admin may have raced us between the load above and this UPDATE. If
    // that happens, return 409 and DON'T write an audit row (M2 fix).
    const { data: updated, error: updateErr } = await ctx.admin
      .from("commitment_bag_charges")
      .update(updatePatch)
      .eq("id", chargeId)
      .eq("payment_status", "payment_failed") // optimistic concurrency
      .select("id")
      .maybeSingle();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json(
        { error: "charge already moved by another admin between load and update; retry" },
        { status: 409 }
      );
    }
  }

  // B4 fix: cover actions transition the row to 'charged', which means the
  // bag-aware settlement model treats it as resolved. The charge worker's
  // own terminal exits fire transfer-out + settlement email — when ops
  // covers the cost the worker never runs, so we fire them manually here.
  // Fire-and-forget with try/catch, matching the worker's pattern. Each
  // hook is internally idempotent (bag_transfers composite PK + atomic
  // settlement_email_sent_at stamp) so a double-call is safe.
  if (action === "mark_covered_by_platform" || action === "mark_covered_by_hub") {
    await Promise.allSettled([
      transferOutBagIfReady(ctx.admin, {
        commitmentId: row.commitment_id as string,
        bagNumber: row.bag_number as number,
      }).catch((err) => {
        console.warn(
          `[admin/failed-payments] transferOutBagIfReady failed for charge ${chargeId}: ${err}`
        );
      }),
      sendSettlementEmailIfReady(ctx.admin, row.commitment_id as string).catch(
        (err) => {
          console.warn(
            `[admin/failed-payments] sendSettlementEmailIfReady failed for commitment ${row.commitment_id}: ${err}`
          );
        }
      ),
    ]);
  }

  const auditResult = await recordOpsAction(ctx.admin, {
    performedBy: ctx.user.id,
    actionKind: action,
    targetId: chargeId,
    targetType: "commitment_bag_charge",
    notes,
    metadata,
  });

  if ("error" in auditResult) {
    // The state change already landed but the audit write failed. Surface a
    // 500 so the operator sees something is wrong and can re-attempt or
    // investigate. In practice this is extremely unlikely — the table is
    // append-only with no constraints beyond the action_kind CHECK.
    return NextResponse.json(
      { error: `state updated but audit failed: ${auditResult.error}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    charge_id: chargeId,
    new_payment_status: nextStatus,
    ops_action_id: auditResult.id,
  });
}

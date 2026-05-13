/**
 * Bag-aware campaign close — settlement email trigger (Task 4.13).
 *
 * One job: if a buyer's commitment is fully settled (every
 * `commitment_bag_charges` row terminal, OR no rows exist because the
 * campaign failed under `min_bags_to_succeed`), send them the AC10
 * summary email and stamp `commitments.settlement_email_sent_at` so it
 * cannot fire twice.
 *
 * Two callers:
 *   1. **Charge worker** (`lib/charge-worker.ts`) — fires this as a
 *      fire-and-forget side-effect after each terminal exit point. Most
 *      ticks return `'not_ready'` because at least one sibling row is
 *      still in-flight; the LAST tick that lands a row terminal flips
 *      everything to terminal and we send.
 *   2. **Settle-deadlines route** (campaign-failure branch) — when the
 *      campaign fails under min_bags_to_succeed, zero bag-charge rows are
 *      created and the worker will never run. The route iterates the
 *      campaign's commits and calls this directly; the "no rows" branch
 *      sends the failure variant.
 *
 * Idempotency model:
 *   - One stamp per `commitments` row (migration #41) instead of per
 *     bag-charge row. Email is per-commitment by design.
 *   - Atomic conditional `UPDATE ... WHERE settlement_email_sent_at IS NULL`
 *     means a concurrent worker tick + a settle-deadlines retry cannot
 *     race the same email through. First write wins (1 row updated);
 *     second sees 0 rows updated and we treat it as `'already_sent'`.
 *
 * Fire-and-forget semantics: the function never throws. All failure modes
 * collapse into a `'skipped'` return with a `reason` for log surfacing,
 * matching the structured-status pattern used by `transferOutBagIfReady`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendCampaignSettledEmail } from "@/lib/email";
import type { CampaignSettledBagRow } from "@/lib/email/templates/CampaignSettled";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://crowdroast.com";

// -------------------------------------------------------------------------
// Public types
// -------------------------------------------------------------------------

export type SendSettlementEmailStatus =
  | "sent"
  | "not_ready"
  | "already_sent"
  | "skipped";

export interface SendSettlementEmailResult {
  status: SendSettlementEmailStatus;
  reason?: string;
}

// -------------------------------------------------------------------------
// Test-mode dep injection — production callers never pass deps.
// -------------------------------------------------------------------------

export interface SendSettlementEmailDeps {
  sendCampaignSettledEmail?: typeof sendCampaignSettledEmail;
  now?: () => Date;
}

// -------------------------------------------------------------------------
// Internal joined-row shapes
// -------------------------------------------------------------------------

interface BuyerForEmail {
  email: string | null;
  contact_name: string | null;
}
interface LotForEmail {
  title: string;
  currency: string | null;
}

interface CommitmentRow {
  id: string;
  settlement_email_sent_at: string | null;
  buyer: BuyerForEmail | BuyerForEmail[] | null;
  lot: LotForEmail | LotForEmail[] | null;
}

interface BagChargeSummaryRow {
  bag_number: number;
  kg: number;
  amount_cents: number;
  payment_status:
    | "awaiting_charge"
    | "charging"
    | "charged"
    | "retry_scheduled"
    | "payment_failed";
}

// -------------------------------------------------------------------------
// sendSettlementEmailIfReady
// -------------------------------------------------------------------------

/**
 * Send the AC10 settlement summary if-and-only-if every charge row tied to
 * this commitment is terminal (or zero rows exist), and we have not already
 * stamped the commitment as sent.
 *
 * Returns a structured status — never throws. Callers wire this as a
 * fire-and-forget side-effect: the email is a courtesy, not the source of
 * truth for whether the buyer got their coffee.
 */
export async function sendSettlementEmailIfReady(
  supabase: SupabaseClient,
  commitmentId: string,
  deps: SendSettlementEmailDeps = {}
): Promise<SendSettlementEmailResult> {
  const sendFn = deps.sendCampaignSettledEmail || sendCampaignSettledEmail;
  const now = deps.now || (() => new Date());

  // ---------------------------------------------------------------------
  // 1. Look up the commitment + buyer + lot in a single round-trip.
  // ---------------------------------------------------------------------
  // PostgREST may return one-to-one embeds as a single object OR a
  // one-element array depending on its FK resolution. Normalize defensively.
  const { data: commitment, error: commitmentError } = await supabase
    .from("commitments")
    .select(
      "id, settlement_email_sent_at, buyer:buyer_id(email, contact_name), lot:lot_id(title, currency)"
    )
    .eq("id", commitmentId)
    .single();

  if (commitmentError || !commitment) {
    return {
      status: "skipped",
      reason: `commitment_lookup_failed: ${commitmentError?.message || "no_row"}`,
    };
  }

  const row = commitment as CommitmentRow;

  // ---------------------------------------------------------------------
  // 2. Already sent? Short-circuit on the cheap pre-flight before we run
  //    the sibling-status scan. The atomic UPDATE below catches the race
  //    case where a concurrent caller stamps between this check and our
  //    write; this read just keeps the common case fast.
  // ---------------------------------------------------------------------
  if (row.settlement_email_sent_at) {
    return { status: "already_sent" };
  }

  const buyer = pickEmbed<BuyerForEmail>(row.buyer);
  const lot = pickEmbed<LotForEmail>(row.lot);
  if (!buyer?.email) {
    return { status: "skipped", reason: "buyer_missing_email" };
  }
  if (!lot) {
    return { status: "skipped", reason: "lot_not_found" };
  }

  // ---------------------------------------------------------------------
  // 3. Pull all bag-charge rows for this commitment.
  // ---------------------------------------------------------------------
  // Zero rows is the campaign-failure variant — campaign closed under
  // `min_bags_to_succeed` so no charges were ever created.
  // Any non-terminal sibling means we wait — the next worker tick will
  // re-evaluate when it lands.
  const { data: bagRows, error: bagRowsError } = await supabase
    .from("commitment_bag_charges")
    .select("bag_number, kg, amount_cents, payment_status")
    .eq("commitment_id", commitmentId)
    .order("bag_number", { ascending: true });

  if (bagRowsError) {
    return {
      status: "skipped",
      reason: `bag_charges_lookup_failed: ${bagRowsError.message}`,
    };
  }

  const charges = (bagRows || []) as BagChargeSummaryRow[];
  const hasNonTerminal = charges.some(
    (r) =>
      r.payment_status === "awaiting_charge" ||
      r.payment_status === "charging" ||
      r.payment_status === "retry_scheduled"
  );

  if (hasNonTerminal) {
    return { status: "not_ready" };
  }

  // ---------------------------------------------------------------------
  // 4. Build the email payload.
  // ---------------------------------------------------------------------
  // Empty `bagRows` produces the failure-variant on the template side.
  // `totals.kgFailed` counts only `payment_failed` rows; the in-progress
  // case is short-circuited above so it should never appear here.
  const emailBagRows: CampaignSettledBagRow[] = charges.map((r) => ({
    bagNumber: r.bag_number,
    kg: r.kg,
    amountCents: r.amount_cents,
    status: r.payment_status === "charged" ? "charged" : "payment_failed",
  }));

  const totals = charges.reduce(
    (acc, r) => {
      if (r.payment_status === "charged") {
        acc.kgPurchased += Number(r.kg || 0);
        acc.totalChargedCents += Number(r.amount_cents || 0);
      } else if (r.payment_status === "payment_failed") {
        acc.kgFailed += Number(r.kg || 0);
      }
      return acc;
    },
    { kgPurchased: 0, kgFailed: 0, totalChargedCents: 0 }
  );

  const currency = (lot.currency || "USD").toUpperCase();
  const commitmentUrl = `${APP_URL}/dashboard/buyer/commitments/${commitmentId}`;

  // ---------------------------------------------------------------------
  // 5. Atomic claim: stamp the row first, send second. This is the
  //    inverted-order Stripe-style "claim then act" pattern — if the
  //    UPDATE returns zero rows another caller already won, so we skip
  //    the Resend call entirely and return `'already_sent'`. If we DO
  //    win the stamp but Resend fails, the email is lost: the trigger
  //    will NOT retry (the stamp is set). That's a deliberate tradeoff:
  //    the AC10 SLA is "best effort" per the spec's relaxed open-question
  //    #3, and duplicate sends are worse than missed ones.
  // ---------------------------------------------------------------------
  const stampedAt = now().toISOString();
  const { data: claimedRows, error: claimError } = await supabase
    .from("commitments")
    .update({ settlement_email_sent_at: stampedAt })
    .eq("id", commitmentId)
    .is("settlement_email_sent_at", null)
    .select("id");

  if (claimError) {
    return {
      status: "skipped",
      reason: `stamp_update_failed: ${claimError.message}`,
    };
  }
  if (!claimedRows || claimedRows.length === 0) {
    // Another caller stamped between our read and our write — they're
    // sending (or have sent) the email. Bow out cleanly.
    return { status: "already_sent" };
  }

  // ---------------------------------------------------------------------
  // 6. Fire the email. The stamp is already persisted; a Resend hiccup
  //    here means the buyer doesn't get THIS attempt's email — surface as
  //    `'skipped'` with reason. We ALSO write `settlement_email_status`
  //    (`'sent' | 'send_failed'`, migration #42) so the daily sweeper can
  //    find failed sends, clear both columns, and re-attempt. The stamp
  //    column itself stays in place during the in-flight send so concurrent
  //    callers cannot race a duplicate send through.
  // ---------------------------------------------------------------------
  let sendSucceeded = false;
  let sendErrorReason: string | null = null;
  try {
    const sendResult = await sendFn({
      buyer: { email: buyer.email, contact_name: buyer.contact_name },
      lotTitle: lot.title,
      currency,
      bagRows: emailBagRows,
      totals,
      commitmentUrl,
    });
    if (sendResult.success) {
      sendSucceeded = true;
    } else {
      sendErrorReason = `send_failed_after_stamp: ${sendResult.error || "unknown"}`;
    }
  } catch (err) {
    sendErrorReason = `send_threw_after_stamp: ${err instanceof Error ? err.message : "unknown"}`;
  }

  // Record outcome on the commitment so the sweeper can pick up failed
  // attempts. Write errors here are non-fatal — the stamp still gates
  // duplicate sends. We log via the return reason so the call site can
  // surface it, but the email status column drift is benign (sweeper
  // will simply not re-attempt; humans can re-trigger via admin).
  const outcomeStatus = sendSucceeded ? "sent" : "send_failed";
  await supabase
    .from("commitments")
    .update({ settlement_email_status: outcomeStatus })
    .eq("id", commitmentId);

  if (!sendSucceeded) {
    return {
      status: "skipped",
      reason: sendErrorReason || "send_failed_after_stamp: unknown",
    };
  }

  return { status: "sent" };
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

/**
 * PostgREST returns embedded one-to-one rows as either a single object or a
 * single-element array. Normalize to "first element or null" so the caller
 * doesn't branch on shape.
 */
function pickEmbed<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

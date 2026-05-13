/**
 * Bag-aware campaign close — transfer-out (Task 4.11).
 *
 * After every `commitment_bag_charges` row for a given (lot, bag) reaches a
 * terminal state (`charged` or `payment_failed`), this module fires the
 * seller + hub Stripe transfers for that bag's settled revenue.
 *
 * Wiring: called from `lib/charge-worker.ts` as a fire-and-forget side-effect
 * at the end of `recordCharged` and `markPaymentFailed`. Every successful
 * exit from a worker tick checks "is the bag now complete?" — the function
 * is a no-op for any bag with at least one non-terminal sibling row.
 *
 * Idempotency: a single `bag_transfers (lot_id, bag_number)` row is the
 * durable marker. Its presence means "we've already fired transfers for
 * this bag." The composite primary key guarantees exact-once across
 * concurrent worker ticks via duplicate-key error.
 *
 * Split math (see migration #40 header for the long form):
 *   • seller_amount   = sum( round(row.amount_cents / (1 + PLATFORM_FEE_RATE)) )
 *                       across the bag's `charged` rows (per-row back-solve
 *                       from the buyer-side cents, mirroring buyer-side
 *                       rounding so the seller share can't exceed the
 *                       buyer total).
 *   • hub_amount      = floor(total_buyer_paid × HUB_SHARE_BPS / 10000),
 *                       capped at (total_buyer_paid − seller_amount)
 *   • platform_keeps  = total_buyer_paid − seller_amount − hub_amount
 *                       (clamped at 0 in `computeSplit` as a defensive
 *                       guard against any residual rounding drift)
 *
 * Where `total_buyer_paid` is the sum of `amount_cents` across the bag's
 * `charged` rows ONLY — `payment_failed` rows contributed no money and are
 * excluded. We deliberately do NOT re-resolve the seller's tier price from
 * `pricing_tiers` (the legacy `min_quantity_kg` column would lie post the
 * bag-tier migration). The row IS the contract.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createBagTransfer,
  type StripeTransfer,
} from "@/lib/stripe";
import { HUB_SHARE_BPS, PLATFORM_FEE_RATE } from "@/lib/pricing";
import { computeSplit } from "@/lib/payments/settlement-logic.js";

// -------------------------------------------------------------------------
// Public types
// -------------------------------------------------------------------------

export type TransferOutBagStatus =
  | "transferred"
  | "not_ready"
  | "already_done"
  | "skipped";

export interface TransferOutBagResult {
  status: TransferOutBagStatus;
  reason?: string;
  /**
   * Populated on `'transferred'`. The amounts that landed in each
   * destination + the bag's settled-revenue total. Useful for tests and
   * for the eventual settlement-email payload.
   */
  amounts?: {
    sellerCents: number;
    hubCents: number;
    platformCents: number;
    totalChargedCents: number;
  };
  /**
   * Populated on `'transferred'`. The two Stripe transfer ids returned by
   * `/v1/transfers`. NULL means that leg was skipped (e.g. zero amount).
   */
  transferIds?: {
    seller: string | null;
    hub: string | null;
  };
}

/**
 * Test-mode overrides for Stripe + clock. Production callers never pass
 * these. Mirrors the dep-injection shape on `processBagCharge`.
 */
export interface TransferOutBagDeps {
  createBagTransfer?: typeof createBagTransfer;
  now?: () => Date;
}

// -------------------------------------------------------------------------
// Internal joined-row shapes
// -------------------------------------------------------------------------

/**
 * Narrow shape of the commitment + lot + campaign + hub join we need to
 * locate the two Stripe Connect destination accounts. Seller pricing is
 * NOT resolved from this join — it is back-solved per-row from each
 * `commitment_bag_charges.amount_cents` (which is the actual buyer-side
 * contract for that row, stamped at charge time). See "Split math" above.
 */
interface CommitmentJoin {
  lot_id: string;
  campaign_id: string | null;
  lot: {
    id: string;
    seller_id: string;
    currency: string | null;
    seller_profile: {
      stripe_connect_account_id: string | null;
    } | null;
  } | null;
  campaign: {
    id: string;
    hub: {
      owner_profile: {
        stripe_connect_account_id: string | null;
      } | null;
    } | null;
  } | null;
}

interface SiblingChargeRow {
  amount_cents: number;
  kg: number;
  payment_status:
    | "awaiting_charge"
    | "charging"
    | "charged"
    | "retry_scheduled"
    | "payment_failed";
}

// -------------------------------------------------------------------------
// transferOutBagIfReady
// -------------------------------------------------------------------------

/**
 * If every `commitment_bag_charges` row for the (lot, bag) tuple owning the
 * given charge row is terminal AND we have not yet recorded a `bag_transfers`
 * row for that pair, fire the seller + hub transfers and insert the ledger
 * row. Otherwise return a non-`'transferred'` status describing why.
 *
 * Failure handling: any unexpected error short-circuits to a `'skipped'`
 * return rather than throwing. The charge worker calls this in a try/catch
 * already, but returning a structured status keeps the call site simpler
 * and the failure modes legible in tests.
 */
export async function transferOutBagIfReady(
  supabase: SupabaseClient,
  args: { commitmentId: string; bagNumber: number },
  deps: TransferOutBagDeps = {}
): Promise<TransferOutBagResult> {
  const transferFn = deps.createBagTransfer || createBagTransfer;

  // ---------------------------------------------------------------------
  // 1. Resolve the (lot, bag) tuple + destination accounts.
  // ---------------------------------------------------------------------
  // One join covers everything: the commitment names the lot (→ seller +
  // pricing context) and the campaign (→ hub owner). The lot's currency
  // funnels into both transfer calls.
  const { data: commitmentJoin, error: commitmentError } = await supabase
    .from("commitments")
    .select(
      "lot_id, campaign_id, lot:lot_id(id, seller_id, currency, seller_profile:seller_id(stripe_connect_account_id)), campaign:campaign_id(id, hub:hub_id(owner_profile:owner_id(stripe_connect_account_id)))"
    )
    .eq("id", args.commitmentId)
    .single();

  if (commitmentError || !commitmentJoin) {
    return {
      status: "skipped",
      reason: `commitment_lookup_failed: ${commitmentError?.message || "no_row"}`,
    };
  }

  // PostgREST returns single-object or one-element-array shapes depending on
  // its FK resolution; normalize. (We use `.single()` on the outer query, so
  // commitmentJoin itself is already a single object — but the embeds may
  // still be arrays.)
  const normalized = normalizeCommitmentJoin(commitmentJoin);
  if (!normalized.lot) {
    return { status: "skipped", reason: "lot_not_found_on_commitment" };
  }
  const lotId = normalized.lot.id;
  const sellerAccountId =
    normalized.lot.seller_profile?.stripe_connect_account_id || null;
  const hubAccountId =
    normalized.campaign?.hub?.owner_profile?.stripe_connect_account_id || null;
  const currency = (normalized.lot.currency || "USD").toLowerCase();

  if (!sellerAccountId) {
    return { status: "skipped", reason: "seller_missing_connect_account" };
  }
  if (!hubAccountId) {
    return { status: "skipped", reason: "hub_missing_connect_account" };
  }

  // ---------------------------------------------------------------------
  // 2. Idempotency guard: has a transfer already fired for this bag?
  // ---------------------------------------------------------------------
  // Done BEFORE the sibling-status scan so the cheap PK lookup short-circuits
  // the worst-case "every tick re-counts every bag" load on the worker.
  const { data: existingTransfer, error: existingTransferError } =
    await supabase
      .from("bag_transfers")
      .select("lot_id")
      .eq("lot_id", lotId)
      .eq("bag_number", args.bagNumber)
      .maybeSingle();

  if (existingTransferError) {
    return {
      status: "skipped",
      reason: `bag_transfers_lookup_failed: ${existingTransferError.message}`,
    };
  }
  if (existingTransfer) {
    return { status: "already_done" };
  }

  // ---------------------------------------------------------------------
  // 3. Are ALL sibling rows for this (lot, bag) terminal?
  // ---------------------------------------------------------------------
  // The `commitment_bag_charges` table is commitment-scoped, not lot-scoped,
  // so the lookup goes via commitments.lot_id. PostgREST's filter-through-FK
  // syntax (`commitment.lot_id=eq.<id>`) is the canonical pattern in this
  // codebase (see the buyer-dashboard reads).
  const { data: siblingRows, error: siblingError } = await supabase
    .from("commitment_bag_charges")
    .select("amount_cents, kg, payment_status, commitment:commitment_id!inner(lot_id)")
    .eq("bag_number", args.bagNumber)
    .eq("commitment.lot_id", lotId);

  if (siblingError) {
    return {
      status: "skipped",
      reason: `sibling_lookup_failed: ${siblingError.message}`,
    };
  }
  if (!siblingRows || siblingRows.length === 0) {
    // Defensive: the caller just witnessed a row for this bag transition to
    // terminal, so at minimum one row should exist. If we see zero, the most
    // likely cause is a transactional read race — skip and let the next
    // worker tick catch up.
    return { status: "skipped", reason: "no_sibling_rows" };
  }

  const siblings = siblingRows as unknown as SiblingChargeRow[];

  const allTerminal = siblings.every(
    (r) => r.payment_status === "charged" || r.payment_status === "payment_failed"
  );
  if (!allTerminal) {
    return { status: "not_ready" };
  }

  // Bag's settled revenue: only `charged` rows contributed money. Failed
  // rows produced no Stripe charge, so they don't enter the split math.
  const chargedRows = siblings.filter((r) => r.payment_status === "charged");
  const totalChargedCents = chargedRows.reduce(
    (sum, r) => sum + Number(r.amount_cents || 0),
    0
  );

  if (totalChargedCents === 0) {
    // All rows ended `payment_failed` — there's no money to transfer.
    // Record the row so we don't re-evaluate the bag on every future tick.
    const { error: insertError } = await supabase
      .from("bag_transfers")
      .insert({
        lot_id: lotId,
        bag_number: args.bagNumber,
        currency: (currency || "usd").toUpperCase(),
        seller_amount_cents: 0,
        hub_amount_cents: 0,
        platform_amount_cents: 0,
        seller_transfer_id: null,
        hub_transfer_id: null,
      });
    if (insertError) {
      return {
        status: "skipped",
        reason: `bag_transfers_insert_failed_zero: ${insertError.message}`,
      };
    }
    return {
      status: "transferred",
      reason: "all_rows_failed_no_money_to_move",
      amounts: {
        sellerCents: 0,
        hubCents: 0,
        platformCents: 0,
        totalChargedCents: 0,
      },
      transferIds: { seller: null, hub: null },
    };
  }

  // ---------------------------------------------------------------------
  // 4. Compute the seller's base (pre-platform-fee) cut per row.
  // ---------------------------------------------------------------------
  // Each `commitment_bag_charges` row's `amount_cents` is the canonical
  // buyer-side contract: it was stamped at charge time using whichever tier
  // applied to the completed-bag count then. Back-solving the seller's base
  // amount from that stamped value sidesteps the tier-dimension problem
  // entirely — we don't care whether the tier was resolved by kg or by bag
  // count, because the row already encodes the answer:
  //
  //   amount_cents = round(kg × seller_price × (1 + fee) × 100)
  //   sellerBase_per_row ≈ round(amount_cents / (1 + fee))
  //
  // Per-row rounding here MIRRORS the per-row rounding on the buyer side,
  // so totalChargedCents − sum(sellerBase_per_row) cannot drift in a
  // direction that pushes the platform share negative (the prior bug:
  // seller computed once over the totalKg sum, with rounding that could
  // exceed the per-row sum on irrational prices/tiny kgs).
  const sellerAmountCents = chargedRows.reduce(
    (sum, r) =>
      sum + Math.round(Number(r.amount_cents || 0) / (1 + PLATFORM_FEE_RATE)),
    0
  );

  // ---------------------------------------------------------------------
  // 5. Compute the split.
  // ---------------------------------------------------------------------
  // sellerAmount: per-row sum derived above (NO platform fee — the seller
  //               sees only their own listed price).
  // hubAmount:    2% of buyer total, capped to available headroom. `computeSplit`
  //               does the floor + cap in one place, and now also clamps
  //               platformAmount at 0 with a warn-log if it ever goes negative.
  // platformKeeps: total received from buyers minus seller minus hub. This is
  //                where the platform's 10% fee (≈ totalCharged − sellerBase)
  //                lives, minus the 2% it forwards to the hub. Stripe
  //                processing fees come out of this share — we don't move
  //                them, so they stay on the platform's main balance.
  const split = computeSplit({
    grossAmountCents: totalChargedCents,
    sellerNetAmountCents: sellerAmountCents,
  });
  // Note: `computeSplit` already enforces `hub ≤ total − seller`, so the
  // numbers below are pre-flighted and safe to pass to Stripe.

  // ---------------------------------------------------------------------
  // 6. Fire the transfers.
  // ---------------------------------------------------------------------
  // Order matters for partial-failure semantics: seller first (the bigger,
  // user-facing payout) then hub. If seller succeeds and hub throws, the
  // ledger row is NOT inserted — the next worker tick will re-run, and
  // seller's idempotent retry will deduplicate against Stripe's prior
  // success while hub's call gets a fresh attempt. The bag-scoped
  // idempotency keys guarantee no double-pay.
  let sellerTransfer: StripeTransfer | null = null;
  let hubTransfer: StripeTransfer | null = null;

  if (split.sellerAmount > 0) {
    try {
      sellerTransfer = await transferFn({
        amountCents: split.sellerAmount,
        currency,
        destinationAccountId: sellerAccountId,
        lotId,
        bagNumber: args.bagNumber,
        role: "seller",
      });
    } catch (err) {
      return {
        status: "skipped",
        reason: `seller_transfer_failed: ${err instanceof Error ? err.message : "unknown"}`,
      };
    }
  }

  if (split.hubAmount > 0) {
    try {
      hubTransfer = await transferFn({
        amountCents: split.hubAmount,
        currency,
        destinationAccountId: hubAccountId,
        lotId,
        bagNumber: args.bagNumber,
        role: "hub",
      });
    } catch (err) {
      return {
        status: "skipped",
        reason: `hub_transfer_failed: ${err instanceof Error ? err.message : "unknown"}`,
      };
    }
  }

  // ---------------------------------------------------------------------
  // 7. Record the ledger row.
  // ---------------------------------------------------------------------
  const { error: insertError } = await supabase
    .from("bag_transfers")
    .insert({
      lot_id: lotId,
      bag_number: args.bagNumber,
      currency: currency.toUpperCase(),
      seller_amount_cents: split.sellerAmount,
      hub_amount_cents: split.hubAmount,
      platform_amount_cents: split.platformAmount,
      seller_transfer_id: sellerTransfer?.id ?? null,
      hub_transfer_id: hubTransfer?.id ?? null,
    });

  if (insertError) {
    // Duplicate-key here is the concurrent-worker race winning the second
    // half: the OTHER tick fired its transfers and inserted before we did.
    // Stripe's idempotency means our transfer calls above replayed the
    // existing operations rather than double-paying, so the net effect is
    // safe. Surface as `already_done` instead of a hard failure.
    if (
      typeof insertError.message === "string" &&
      insertError.message.toLowerCase().includes("duplicate key")
    ) {
      return { status: "already_done", reason: "concurrent_winner" };
    }
    return {
      status: "skipped",
      reason: `bag_transfers_insert_failed: ${insertError.message}`,
    };
  }

  return {
    status: "transferred",
    amounts: {
      sellerCents: split.sellerAmount,
      hubCents: split.hubAmount,
      platformCents: split.platformAmount,
      totalChargedCents,
    },
    transferIds: {
      seller: sellerTransfer?.id ?? null,
      hub: hubTransfer?.id ?? null,
    },
  };
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

/**
 * PostgREST sometimes serializes embedded one-to-one relations as a
 * single-element array, sometimes as a single object, depending on the
 * relationship resolution. Normalize everything to "first element or null"
 * so the math above doesn't have to branch on shape.
 */
function normalizeCommitmentJoin(raw: unknown): CommitmentJoin {
  // Treat the outer shape as already an object (the caller used `.single()`).
  const obj = raw as Record<string, unknown>;
  return {
    lot_id: (obj.lot_id as string) || "",
    campaign_id: (obj.campaign_id as string | null) || null,
    lot: normalizeLotEmbed(obj.lot),
    campaign: normalizeCampaignEmbed(obj.campaign),
  };
}

function normalizeLotEmbed(raw: unknown): CommitmentJoin["lot"] {
  const lotObj = pickFirst(raw);
  if (!lotObj) return null;
  const sellerProfile = pickFirst(
    (lotObj as Record<string, unknown>).seller_profile
  );
  return {
    id: String((lotObj as Record<string, unknown>).id || ""),
    seller_id: String((lotObj as Record<string, unknown>).seller_id || ""),
    currency: ((lotObj as Record<string, unknown>).currency as string) || null,
    seller_profile: sellerProfile
      ? {
          stripe_connect_account_id:
            ((sellerProfile as Record<string, unknown>)
              .stripe_connect_account_id as string | null) ?? null,
        }
      : null,
  };
}

function normalizeCampaignEmbed(raw: unknown): CommitmentJoin["campaign"] {
  const campaignObj = pickFirst(raw);
  if (!campaignObj) return null;
  const hub = pickFirst((campaignObj as Record<string, unknown>).hub);
  const ownerProfile = hub
    ? pickFirst((hub as Record<string, unknown>).owner_profile)
    : null;
  return {
    id: String((campaignObj as Record<string, unknown>).id || ""),
    hub: hub
      ? {
          owner_profile: ownerProfile
            ? {
                stripe_connect_account_id:
                  ((ownerProfile as Record<string, unknown>)
                    .stripe_connect_account_id as string | null) ?? null,
              }
            : null,
        }
      : null,
  };
}

function pickFirst(value: unknown): unknown {
  if (value == null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

// Re-export the constant so tests can assert the 2% math without a separate
// import of `lib/pricing`. Kept local to make this module self-explanatory.
export { HUB_SHARE_BPS };

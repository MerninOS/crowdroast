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
  getPaymentIntent,
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
  /**
   * Override for `getPaymentIntent` so tests can avoid hitting Stripe.
   * Used to resolve each charged row's `stripe_payment_intent_id` →
   * `latest_charge` so we can pass `source_transaction` on the transfer.
   */
  getPaymentIntent?: typeof getPaymentIntent;
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
  /**
   * Commitment-row `hub_id`. Migration #42 added `bag_transfers.hub_id NOT NULL`
   * and noted that the insert call must populate it. The campaign's hub_id
   * is the authoritative source (see migration header re: relisted lots),
   * but commitments are routed at create time and carry their own hub_id
   * column as a fallback for legacy commitments missing `campaign_id`.
   */
  hub_id: string | null;
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
    hub_id: string | null;
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
  /**
   * Stripe PaymentIntent id from the row. Used to fetch `latest_charge`
   * for `source_transaction` on the transfer. Null when the charge worker
   * hasn't called Stripe yet — but rows in `charged` state always have
   * this populated (the worker writes it on the success path).
   */
  stripe_payment_intent_id: string | null;
}

/**
 * Shape of the `bag_transfers` row we read pre-flight. NULLable
 * transfer-id columns let us encode "partial progress" — e.g. seller
 * leg done, hub leg failed, retry just the hub.
 */
interface ExistingBagTransfer {
  attempt_count: number;
  seller_amount_cents: number;
  hub_amount_cents: number;
  seller_transfer_id: string | null;
  hub_transfer_id: string | null;
  failed_reason: string | null;
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
  const getPI = deps.getPaymentIntent || getPaymentIntent;

  // ---------------------------------------------------------------------
  // 1. Resolve the (lot, bag) tuple + destination accounts.
  // ---------------------------------------------------------------------
  // One join covers everything: the commitment names the lot (→ seller +
  // pricing context) and the campaign (→ hub owner). The lot's currency
  // funnels into both transfer calls.
  const { data: commitmentJoin, error: commitmentError } = await supabase
    .from("commitments")
    .select(
      "lot_id, campaign_id, hub_id, lot:lot_id(id, seller_id, currency, seller_profile:seller_id(stripe_connect_account_id)), campaign:campaign_id(id, hub_id, hub:hub_id(owner_profile:owner_id(stripe_connect_account_id)))"
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
  // Hub id for the ledger row. Prefer the campaign's hub_id so a relisted
  // lot can't backfill prior-hub transfers under a new hub (migration #42's
  // M1 fix). Fall back to commitment.hub_id for legacy rows without
  // campaign_id. Required by `bag_transfers.hub_id NOT NULL`.
  const hubId =
    normalized.campaign?.hub_id || normalized.hub_id || null;
  const currency = (normalized.lot.currency || "USD").toLowerCase();

  if (!sellerAccountId) {
    return { status: "skipped", reason: "seller_missing_connect_account" };
  }
  if (!hubAccountId) {
    return { status: "skipped", reason: "hub_missing_connect_account" };
  }
  if (!hubId) {
    return { status: "skipped", reason: "hub_id_unresolved_on_commitment" };
  }

  // ---------------------------------------------------------------------
  // 2. Read existing bag_transfers state (if any).
  // ---------------------------------------------------------------------
  // Three terminal states we want to short-circuit on:
  //   • Fully done — every required transfer id is set (or the zero-amount
  //     sentinel: nothing to move).
  //   • Already partial — we'll skip whichever leg has its id set and
  //     retry the other leg. The `attempt_count` on the row drives the
  //     fresh idempotency key.
  //   • Not yet attempted — no row. attempt_count starts at 1.
  const { data: existingTransfer, error: existingTransferError } =
    await supabase
      .from("bag_transfers")
      .select(
        "attempt_count, seller_amount_cents, hub_amount_cents, seller_transfer_id, hub_transfer_id, failed_reason"
      )
      .eq("lot_id", lotId)
      .eq("bag_number", args.bagNumber)
      .maybeSingle();

  if (existingTransferError) {
    return {
      status: "skipped",
      reason: `bag_transfers_lookup_failed: ${existingTransferError.message}`,
    };
  }
  const existing = existingTransfer as ExistingBagTransfer | null;
  if (existing) {
    const sellerDone =
      existing.seller_transfer_id != null || existing.seller_amount_cents === 0;
    const hubDone =
      existing.hub_transfer_id != null || existing.hub_amount_cents === 0;
    if (sellerDone && hubDone) {
      return { status: "already_done" };
    }
  }
  const attemptNumber = (existing?.attempt_count ?? 0) + 1;

  // ---------------------------------------------------------------------
  // 3. Are ALL sibling rows for this (lot, bag) terminal?
  // ---------------------------------------------------------------------
  // The `commitment_bag_charges` table is commitment-scoped, not lot-scoped,
  // so the lookup goes via commitments.lot_id. PostgREST's filter-through-FK
  // syntax (`commitment.lot_id=eq.<id>`) is the canonical pattern in this
  // codebase (see the buyer-dashboard reads).
  const { data: siblingRows, error: siblingError } = await supabase
    .from("commitment_bag_charges")
    .select(
      "amount_cents, kg, payment_status, stripe_payment_intent_id, commitment:commitment_id!inner(lot_id)"
    )
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
    // Record the row (upsert because a retry sweep might re-enter this
    // path) so we don't re-evaluate the bag on every future tick.
    const { error: upsertError } = await supabase
      .from("bag_transfers")
      .upsert(
        {
          lot_id: lotId,
          hub_id: hubId,
          bag_number: args.bagNumber,
          currency: (currency || "usd").toUpperCase(),
          seller_amount_cents: 0,
          hub_amount_cents: 0,
          platform_amount_cents: 0,
          seller_transfer_id: null,
          hub_transfer_id: null,
          attempt_count: attemptNumber,
          failed_reason: null,
        },
        { onConflict: "lot_id,bag_number" }
      );
    if (upsertError) {
      return {
        status: "skipped",
        reason: `bag_transfers_insert_failed_zero: ${upsertError.message}`,
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
  // 6. Resolve the `source_transaction` charge id (single-row bags only).
  // ---------------------------------------------------------------------
  // When the bag has exactly ONE charged row, we can link the transfer
  // directly to that row's underlying Stripe charge so Stripe debits it
  // from those funds instead of the platform's general balance. That
  // sidesteps the `insufficient_funds` failure mode entirely — works the
  // moment the buyer charge succeeds, even before Stripe's general
  // balance clears.
  //
  // Multi-row bags (currently 0% of data — verified via SQL) would need
  // N transfers per role to use source_transaction correctly (each from
  // its own row's charge). Until that case exists in production we fall
  // back to a single aggregate transfer drawn from the platform balance
  // and rely on the retry sweep (see process-bag-charges cron) to
  // re-attempt if balance hasn't cleared. TODO: per-row split when the
  // first multi-row bag lands.
  let sourceChargeId: string | null = null;
  if (chargedRows.length === 1 && chargedRows[0].stripe_payment_intent_id) {
    try {
      const pi = await getPI(chargedRows[0].stripe_payment_intent_id);
      sourceChargeId = pi.latest_charge || null;
    } catch (err) {
      // Stripe round-trip blip is non-fatal — fall back to general-balance
      // mode. The retry sweep will re-attempt on the next tick.
      console.warn(
        "[bag-transfer-out] getPaymentIntent failed; transferring from platform balance",
        {
          paymentIntentId: chargedRows[0].stripe_payment_intent_id,
          error: err instanceof Error ? err.message : err,
        }
      );
    }
  }

  // ---------------------------------------------------------------------
  // 7. Fire the transfers — skipping any leg that's already complete.
  // ---------------------------------------------------------------------
  // Order matters for partial-failure semantics: seller first (the bigger,
  // user-facing payout) then hub. Each leg writes its outcome to a
  // bag_transfers UPSERT IMMEDIATELY so a failure persists the partial
  // progress — the retry sweep then picks up only the leg that's still
  // pending, with a fresh idempotency key from the incremented
  // attempt_count.
  let sellerTransfer: StripeTransfer | null = null;
  let hubTransfer: StripeTransfer | null = null;
  const sellerAlreadyDone = existing?.seller_transfer_id != null;
  const hubAlreadyDone = existing?.hub_transfer_id != null;

  if (split.sellerAmount > 0 && !sellerAlreadyDone) {
    try {
      sellerTransfer = await transferFn({
        amountCents: split.sellerAmount,
        currency,
        destinationAccountId: sellerAccountId,
        lotId,
        bagNumber: args.bagNumber,
        role: "seller",
        sourceChargeId,
        attemptNumber,
      });
    } catch (err) {
      const reason = `seller_transfer_failed: ${err instanceof Error ? err.message : "unknown"}`;
      // Persist the failure so the next worker tick can detect retry-needed
      // and re-fire with a fresh idempotency key.
      await upsertLedger(supabase, {
        lotId,
        hubId,
        bagNumber: args.bagNumber,
        currency,
        sellerAmount: split.sellerAmount,
        hubAmount: split.hubAmount,
        platformAmount: split.platformAmount,
        sellerTransferId: null,
        hubTransferId: null,
        attemptCount: attemptNumber,
        failedReason: reason,
      });
      return { status: "skipped", reason };
    }
  }

  if (split.hubAmount > 0 && !hubAlreadyDone) {
    try {
      hubTransfer = await transferFn({
        amountCents: split.hubAmount,
        currency,
        destinationAccountId: hubAccountId,
        lotId,
        bagNumber: args.bagNumber,
        role: "hub",
        sourceChargeId,
        attemptNumber,
      });
    } catch (err) {
      const reason = `hub_transfer_failed: ${err instanceof Error ? err.message : "unknown"}`;
      // Persist with the seller leg's id (which DID succeed this attempt
      // OR was already done from a prior attempt) so the retry sweep
      // doesn't re-fire the seller leg.
      await upsertLedger(supabase, {
        lotId,
        hubId,
        bagNumber: args.bagNumber,
        currency,
        sellerAmount: split.sellerAmount,
        hubAmount: split.hubAmount,
        platformAmount: split.platformAmount,
        sellerTransferId:
          sellerTransfer?.id ?? existing?.seller_transfer_id ?? null,
        hubTransferId: null,
        attemptCount: attemptNumber,
        failedReason: reason,
      });
      return { status: "skipped", reason };
    }
  }

  // ---------------------------------------------------------------------
  // 8. Both legs done — record the ledger row in its terminal state.
  // ---------------------------------------------------------------------
  const upsertError = await upsertLedger(supabase, {
    lotId,
    hubId,
    bagNumber: args.bagNumber,
    currency,
    sellerAmount: split.sellerAmount,
    hubAmount: split.hubAmount,
    platformAmount: split.platformAmount,
    sellerTransferId:
      sellerTransfer?.id ?? existing?.seller_transfer_id ?? null,
    hubTransferId: hubTransfer?.id ?? existing?.hub_transfer_id ?? null,
    attemptCount: attemptNumber,
    failedReason: null,
  });

  if (upsertError) {
    return {
      status: "skipped",
      reason: `bag_transfers_upsert_failed: ${upsertError}`,
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
      seller: sellerTransfer?.id ?? existing?.seller_transfer_id ?? null,
      hub: hubTransfer?.id ?? existing?.hub_transfer_id ?? null,
    },
  };
}

/**
 * UPSERT into `bag_transfers`. Wraps the call so the success path and
 * the four failure-path early-returns share the same shape. Returns the
 * error message on failure (or null on success) so callers can fold it
 * into their own structured return.
 */
async function upsertLedger(
  supabase: SupabaseClient,
  args: {
    lotId: string;
    hubId: string;
    bagNumber: number;
    currency: string;
    sellerAmount: number;
    hubAmount: number;
    platformAmount: number;
    sellerTransferId: string | null;
    hubTransferId: string | null;
    attemptCount: number;
    failedReason: string | null;
  }
): Promise<string | null> {
  const { error } = await supabase
    .from("bag_transfers")
    .upsert(
      {
        lot_id: args.lotId,
        hub_id: args.hubId,
        bag_number: args.bagNumber,
        currency: args.currency.toUpperCase(),
        seller_amount_cents: args.sellerAmount,
        hub_amount_cents: args.hubAmount,
        platform_amount_cents: args.platformAmount,
        seller_transfer_id: args.sellerTransferId,
        hub_transfer_id: args.hubTransferId,
        attempt_count: args.attemptCount,
        failed_reason: args.failedReason,
      },
      { onConflict: "lot_id,bag_number" }
    );
  return error?.message ?? null;
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
    hub_id: (obj.hub_id as string | null) || null,
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
    hub_id:
      ((campaignObj as Record<string, unknown>).hub_id as string | null) ??
      null,
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

import crypto from "crypto";

const STRIPE_API_BASE = "https://api.stripe.com/v1";

function getStripeSecretKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return key;
}

function encodeFormBody(data: Record<string, string | number | boolean | null | undefined>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(data)) {
    if (v === null || v === undefined) continue;
    params.append(k, String(v));
  }
  return params.toString();
}

async function stripeRequest<T>(
  path: string,
  data: Record<string, string | number | boolean | null | undefined>,
  idempotencyKey?: string
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getStripeSecretKey()}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey;
  }

  const res = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: "POST",
    headers,
    body: encodeFormBody(data),
  });

  const json = await res.json();
  if (!res.ok) {
    const message = json?.error?.message || "Stripe API request failed";
    throw new Error(message);
  }

  return json as T;
}

async function stripeGetRequest<T>(
  path: string,
  query?: Record<string, string | number | boolean | null | undefined>
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getStripeSecretKey()}`,
  };

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query || {})) {
    if (v === null || v === undefined) continue;
    params.append(k, String(v));
  }

  const queryString = params.toString();
  const url = queryString ? `${STRIPE_API_BASE}${path}?${queryString}` : `${STRIPE_API_BASE}${path}`;

  const res = await fetch(url, {
    method: "GET",
    headers,
  });

  const json = await res.json();
  if (!res.ok) {
    const message = json?.error?.message || "Stripe API request failed";
    throw new Error(message);
  }

  return json as T;
}

export interface StripeCustomer {
  id: string;
}

export interface StripeCheckoutSession {
  id: string;
  url: string;
  customer: string | null;
  setup_intent?: string | null;
  payment_intent?: string | null;
  payment_status?: string | null;
  mode?: string;
  payment_method?: string | null;
}

export interface StripePaymentIntent {
  id: string;
  status: string;
  latest_charge?: string | null;
}

export interface StripeBalanceTransaction {
  id: string;
  fee?: number;
  currency?: string;
  fee_details?: Array<{
    amount: number;
    currency: string;
    type: string;
    description?: string | null;
  }>;
}

export interface StripeCharge {
  id: string;
  amount?: number;
  currency?: string;
  balance_transaction?: string | StripeBalanceTransaction | null;
}

export interface StripeSetupIntent {
  id: string;
  payment_method?: string | null;
  customer?: string | null;
  status?: string;
}

export interface StripeTransfer {
  id: string;
  amount?: number;
  destination?: string | null;
  source_transaction?: string | null;
  metadata?: {
    commitment_id?: string;
    recipient_role?: string;
  };
}

export interface StripeRefund {
  id: string;
  amount?: number;
  payment_intent?: string | null;
  metadata?: {
    commitment_id?: string;
    kind?: "price_adjustment" | "inviter_credit";
  };
}

export interface StripeAccount {
  id: string;
  details_submitted?: boolean;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  capabilities?: {
    transfers?: string;
    crypto_transfers?: string;
    legacy_payments?: string;
    card_payments?: string;
  };
  requirements?: {
    currently_due?: string[];
    eventually_due?: string[];
    past_due?: string[];
  };
}

export interface StripeAccountLink {
  url: string;
}

export interface StripeLoginLink {
  url: string;
}

export async function createStripeCustomer(email?: string | null) {
  return stripeRequest<StripeCustomer>("/customers", {
    email: email || undefined,
  });
}

export async function createSetupCheckoutSession(params: {
  customerId: string;
  successUrl: string;
  cancelUrl: string;
  commitmentId: string;
  lotId: string;
  currency: string;
}) {
  return stripeRequest<StripeCheckoutSession>("/checkout/sessions", {
    mode: "setup",
    customer: params.customerId,
    currency: params.currency.toLowerCase(),
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    "metadata[commitment_id]": params.commitmentId,
    "metadata[lot_id]": params.lotId,
    "setup_intent_data[metadata][commitment_id]": params.commitmentId,
    "setup_intent_data[metadata][lot_id]": params.lotId,
  });
}

export async function createPaymentCheckoutSession(params: {
  customerId: string;
  successUrl: string;
  cancelUrl: string;
  commitmentId: string;
  lotId: string;
  currency: string;
  amountCents: number;
  lineItemName: string;
}) {
  return stripeRequest<StripeCheckoutSession>("/checkout/sessions", {
    mode: "payment",
    customer: params.customerId,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    "line_items[0][quantity]": 1,
    "line_items[0][price_data][currency]": params.currency.toLowerCase(),
    "line_items[0][price_data][unit_amount]": params.amountCents,
    "line_items[0][price_data][product_data][name]": params.lineItemName,
    "metadata[commitment_id]": params.commitmentId,
    "metadata[lot_id]": params.lotId,
    "payment_intent_data[metadata][commitment_id]": params.commitmentId,
    "payment_intent_data[metadata][lot_id]": params.lotId,
  });
}

export async function getCheckoutSession(sessionId: string) {
  return stripeGetRequest<StripeCheckoutSession>(`/checkout/sessions/${sessionId}`);
}

export async function getSetupIntent(setupIntentId: string) {
  return stripeGetRequest<StripeSetupIntent>(`/setup_intents/${setupIntentId}`);
}

export async function getPaymentIntent(paymentIntentId: string) {
  return stripeGetRequest<StripePaymentIntent>(`/payment_intents/${paymentIntentId}`);
}

// Fetches the Stripe processing fee for a settled charge by expanding the
// associated BalanceTransaction. Returns null when the balance transaction
// hasn't been written yet (rare — Stripe writes it synchronously for
// card charges, but ACH and some async methods can lag). Callers should
// treat null as "fee unknown" and skip the platform-share deduction this run.
export async function getChargeFeeCents(chargeId: string): Promise<number | null> {
  const charge = await stripeGetRequest<StripeCharge>(`/charges/${chargeId}`, {
    "expand[]": "balance_transaction",
  });
  const balanceTx = charge.balance_transaction;
  if (!balanceTx || typeof balanceTx === "string") return null;
  const fee = Number(balanceTx.fee);
  if (!Number.isFinite(fee) || fee < 0) return null;
  return Math.round(fee);
}

export async function createAndConfirmPaymentIntent(params: {
  amountCents: number;
  currency: string;
  customerId: string;
  paymentMethodId: string;
  commitmentId: string;
  lotId: string;
  // Optional caller-supplied idempotency key. Defaults to a commitment-scoped
  // key (`commitment-charge-<id>`), which is correct for legacy 1-charge-per-
  // commitment flows. Bag-aware settlement (Task 4.8) issues multiple charges
  // per commitment — one per completed bag — and supplies the row's stable
  // `stripe_idempotency_key` (`charge:campaign:<id>:commitment:<id>:bag:<n>`)
  // so retries collapse to the same Stripe operation per bag rather than the
  // whole commitment.
  idempotencyKey?: string;
}) {
  return stripeRequest<StripePaymentIntent>(
    "/payment_intents",
    {
      amount: params.amountCents,
      currency: params.currency.toLowerCase(),
      customer: params.customerId,
      payment_method: params.paymentMethodId,
      off_session: true,
      confirm: true,
      "metadata[commitment_id]": params.commitmentId,
      "metadata[lot_id]": params.lotId,
    },
    params.idempotencyKey || `commitment-charge-${params.commitmentId}`
  );
}

/**
 * Verifies a saved payment method is valid and chargeable by creating a
 * tiny manual-capture PaymentIntent (50 minor units, e.g. $0.50 USD), then
 * immediately canceling it to release the authorization. Implements AC12 of
 * the bag-aware-campaign-close spec: under the charge-on-fill model the
 * actual money move happens at settlement, so we need a commit-time signal
 * that the card the buyer just saved will work later. An auth-and-void is
 * the documented Stripe pattern for card validation.
 *
 * Returns a discriminated union rather than throwing so callers can branch
 * cleanly between "issue a 400 to the buyer" and "real infra failure":
 *   - { ok: true } — auth succeeded (status `requires_capture` or `succeeded`).
 *     The cancel call is best-effort; if it fails the auth expires on its
 *     own within ~7 days, which is acceptable. We log a warning but still
 *     return ok: true because the buyer's card was successfully validated.
 *   - { ok: false, reason } — auth failed. `reason` is the Stripe decline
 *     code where available (e.g. "card_declined", "insufficient_funds") or
 *     the raw error message otherwise. Caller should map to a user-facing
 *     error in Mernin' voice.
 *
 * Stripe does not charge processing fees on authorizations that are voided
 * before capture, so probing every commit is free in production (and test
 * mode is free regardless). See spec Open Question #9. The idempotency key
 * is deterministic per payment method, so a retried commit attempt reuses
 * the same auth instead of stacking new ones against the cardholder.
 */
export async function probeCardAuth(params: {
  paymentMethodId: string;
  customerId: string;
  currency: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  let intent: StripePaymentIntent;
  try {
    intent = await stripeRequest<StripePaymentIntent>(
      "/payment_intents",
      {
        amount: 50,
        currency: params.currency.toLowerCase(),
        customer: params.customerId,
        payment_method: params.paymentMethodId,
        capture_method: "manual",
        confirm: true,
        off_session: true,
        "metadata[purpose]": "auth_probe",
      },
      `auth-probe-${params.paymentMethodId}`
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : "card_auth_failed";
    return { ok: false, reason };
  }

  if (intent.status !== "requires_capture" && intent.status !== "succeeded") {
    return { ok: false, reason: intent.status || "card_auth_failed" };
  }

  try {
    await stripeRequest<StripePaymentIntent>(`/payment_intents/${intent.id}/cancel`, {});
  } catch (cancelErr) {
    const detail = cancelErr instanceof Error ? cancelErr.message : String(cancelErr);
    console.warn(
      `[probeCardAuth] failed to cancel auth-probe PaymentIntent ${intent.id}; it will expire on its own. Detail: ${detail}`
    );
  }

  return { ok: true };
}

export async function createTransfer(params: {
  amountCents: number;
  currency: string;
  destinationAccountId: string;
  sourceChargeId: string;
  commitmentId: string;
  role: "seller" | "hub" | "crowdroast";
}) {
  return stripeRequest<StripeTransfer>(
    "/transfers",
    {
      amount: params.amountCents,
      currency: params.currency.toLowerCase(),
      destination: params.destinationAccountId,
      source_transaction: params.sourceChargeId,
      "metadata[commitment_id]": params.commitmentId,
      "metadata[recipient_role]": params.role,
    },
    `transfer-${params.role}-${params.commitmentId}`
  );
}

/**
 * Bag-aware (Task 4.11) transfer-out helper. Differs from `createTransfer`
 * on two axes:
 *
 *   1. **Optional `source_transaction`**. When the caller passes
 *      `sourceChargeId`, Stripe debits the transfer from that specific
 *      buyer charge's funds — which means the transfer doesn't need the
 *      platform's main available balance to clear first. This is the
 *      preferred path: it works the moment the charge succeeds, even
 *      while Stripe still considers the platform balance "pending" (2-7
 *      days in production, sometimes longer in test mode where the
 *      `4000000000000077` test card is required to seed available balance).
 *
 *      The previous design dropped `source_transaction` entirely on the
 *      theory that "multiple buyers can contribute to one bag," but in
 *      practice transfer-out fires per-charge-row anyway, so each
 *      sub-transfer cleanly maps to one source charge. Callers that
 *      don't pass it (legacy code path or aggregate-mode tests) still
 *      get the old behavior — Stripe draws from the general balance and
 *      will fail with `insufficient_funds` if the balance hasn't cleared.
 *
 *   2. **Per-attempt idempotency**. The key now includes an
 *      `attempt-<N>` suffix so a retry after a Stripe failure
 *      (`insufficient_funds`, transient network blip, etc.) doesn't
 *      replay the cached error response — Stripe caches the original
 *      response under each unique key for 24h regardless of success or
 *      failure, so a deterministic key would lock us out of retries
 *      for a full day. The caller passes `attemptNumber` from the
 *      `bag_transfers.attempt_count` column (migration #46) so retries
 *      get a fresh key while same-attempt re-invocations (Stripe
 *      webhook retries, concurrent worker ticks) still de-duplicate.
 *
 *      The key format `bag-transfer-<role>-<lotId>-<bagNumber>-attempt-<N>`
 *      remains scoped to the bag — different lots, bags, and roles all
 *      get distinct keys without coordination.
 *
 * Recorded metadata is bag-scoped (lot_id, bag_number) rather than
 * commitment-scoped because there is no single commitment that "owns" a
 * bag in this model — buyers contribute kg across bags.
 */
export async function createBagTransfer(params: {
  amountCents: number;
  currency: string;
  destinationAccountId: string;
  lotId: string;
  bagNumber: number;
  role: "seller" | "hub";
  /**
   * Stripe charge id (`ch_...`) to set as `source_transaction`. When set,
   * Stripe debits the transfer from that specific charge's funds instead
   * of the platform's general balance — the recommended path because it
   * succeeds immediately on each charged row's funds, no waiting for
   * platform balance to clear. Pass null/undefined to fall back to the
   * legacy general-balance flow (e.g. for multi-row aggregate transfers
   * that don't map to a single source).
   */
  sourceChargeId?: string | null;
  /**
   * The 1-based attempt number for this transfer. Suffixed onto the
   * Stripe idempotency key so retries after a failure use a fresh key.
   * Default 1 preserves backwards compatibility for callers that don't
   * track retries.
   */
  attemptNumber?: number;
}) {
  const attempt = params.attemptNumber ?? 1;
  const body: Record<string, unknown> = {
    amount: params.amountCents,
    currency: params.currency.toLowerCase(),
    destination: params.destinationAccountId,
    "metadata[lot_id]": params.lotId,
    "metadata[bag_number]": params.bagNumber,
    "metadata[recipient_role]": params.role,
    "metadata[settlement_model]": "bag_aware",
    "metadata[attempt_number]": attempt,
  };
  if (params.sourceChargeId) {
    body.source_transaction = params.sourceChargeId;
  }
  return stripeRequest<StripeTransfer>(
    "/transfers",
    body,
    `bag-transfer-${params.role}-${params.lotId}-${params.bagNumber}-attempt-${attempt}`
  );
}

export async function listTransfersForSourceCharge(sourceChargeId: string) {
  const transfers = await stripeGetRequest<{ data: StripeTransfer[] }>("/transfers", {
    limit: 100,
  });

  return {
    data: (transfers.data || []).filter(
      (transfer) => transfer.source_transaction === sourceChargeId
    ),
  };
}

export async function createRefund(params: {
  paymentIntentId: string;
  amountCents?: number;
  commitmentId: string;
  reason?: "duplicate" | "fraudulent" | "requested_by_customer";
  idempotencySuffix?: string;
  // Stamps metadata.kind so settle-time retries can detect prior refunds of
  // the same kind via listRefundsForPaymentIntent (the Stripe idempotency
  // key only covers ~24h; this filter is the durable retry guard).
  kind?: "price_adjustment" | "inviter_credit";
}) {
  const suffix = params.idempotencySuffix ? `-${params.idempotencySuffix}` : "";
  const body: Record<string, string | number | undefined> = {
    payment_intent: params.paymentIntentId,
    amount: params.amountCents,
    reason: params.reason,
    "metadata[commitment_id]": params.commitmentId,
  };
  if (params.kind) {
    body["metadata[kind]"] = params.kind;
  }
  return stripeRequest<{ id: string }>(
    "/refunds",
    body,
    `refund-${params.commitmentId}${suffix}`
  );
}

export async function listRefundsForPaymentIntent(paymentIntentId: string) {
  return stripeGetRequest<{ data: StripeRefund[] }>("/refunds", {
    payment_intent: paymentIntentId,
    limit: 100,
  });
}

export async function createExpressConnectedAccount(params: {
  email?: string | null;
  businessType?: "individual" | "company";
}) {
  return stripeRequest<StripeAccount>("/accounts", {
    type: "express",
    email: params.email || undefined,
    business_type: params.businessType || "company",
    "capabilities[card_payments][requested]": true,
    "capabilities[transfers][requested]": true,
  });
}

export async function requestTransferCapabilities(accountId: string) {
  return stripeRequest<StripeAccount>(`/accounts/${accountId}`, {
    "capabilities[card_payments][requested]": true,
    "capabilities[transfers][requested]": true,
  });
}

export async function getConnectedAccount(accountId: string) {
  return stripeGetRequest<StripeAccount>(`/accounts/${accountId}`);
}

export async function createAccountOnboardingLink(params: {
  accountId: string;
  refreshUrl: string;
  returnUrl: string;
}) {
  return stripeRequest<StripeAccountLink>("/account_links", {
    account: params.accountId,
    type: "account_onboarding",
    refresh_url: params.refreshUrl,
    return_url: params.returnUrl,
  });
}

export async function createExpressDashboardLoginLink(params: {
  accountId: string;
}) {
  return stripeRequest<StripeLoginLink>(`/accounts/${params.accountId}/login_links`, {});
}

function parseStripeSignature(signatureHeader: string) {
  const parts = signatureHeader.split(",").map((part) => part.trim());
  let timestamp: string | null = null;
  const signatures: string[] = [];

  for (const part of parts) {
    const [k, v] = part.split("=");
    if (k === "t") timestamp = v;
    if (k === "v1") signatures.push(v);
  }

  return { timestamp, signatures };
}

// Stripe's official tolerance for webhook timestamp drift. Older signed
// payloads are rejected so a captured webhook can't be replayed indefinitely.
const STRIPE_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300;

export function verifyStripeWebhookSignature(payload: string, signatureHeader: string) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("Missing STRIPE_WEBHOOK_SECRET");
  }

  const { timestamp, signatures } = parseStripeSignature(signatureHeader);
  if (!timestamp || signatures.length === 0) return false;

  const timestampSeconds = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(timestampSeconds)) return false;
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds);
  if (ageSeconds > STRIPE_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const expected = crypto.createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  return signatures.some((sig) => {
    try {
      const sigBuffer = Buffer.from(sig, "hex");
      if (sigBuffer.length !== expectedBuffer.length) return false;
      return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
    } catch {
      return false;
    }
  });
}

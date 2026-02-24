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

export interface StripeSetupIntent {
  id: string;
  payment_method?: string | null;
  customer?: string | null;
  status?: string;
}

export interface StripeTransfer {
  id: string;
}

export interface StripeAccount {
  id: string;
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

export async function createAndConfirmPaymentIntent(params: {
  amountCents: number;
  currency: string;
  customerId: string;
  paymentMethodId: string;
  commitmentId: string;
  lotId: string;
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
    `commitment-charge-${params.commitmentId}`
  );
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

export async function createRefund(params: {
  paymentIntentId: string;
  amountCents?: number;
  commitmentId: string;
  reason?: "duplicate" | "fraudulent" | "requested_by_customer";
  idempotencySuffix?: string;
}) {
  const suffix = params.idempotencySuffix ? `-${params.idempotencySuffix}` : "";
  return stripeRequest<{ id: string }>("/refunds", {
    payment_intent: params.paymentIntentId,
    amount: params.amountCents,
    reason: params.reason,
    "metadata[commitment_id]": params.commitmentId,
  }, `refund-${params.commitmentId}${suffix}`);
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

export function verifyStripeWebhookSignature(payload: string, signatureHeader: string) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("Missing STRIPE_WEBHOOK_SECRET");
  }

  const { timestamp, signatures } = parseStripeSignature(signatureHeader);
  if (!timestamp || signatures.length === 0) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const expected = crypto.createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");

  return signatures.some((sig) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      return false;
    }
  });
}

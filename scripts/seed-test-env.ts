#!/usr/bin/env tsx
/**
 * CrowdRoast dev seed — populates a local Supabase + Stripe sandbox
 * with the canonical cast described in the test-environment spec:
 *   - 1 hub owner
 *   - 1 seller (with Stripe Connect sandbox account)
 *   - 3 buyers (added in task 3.4)
 *   - 1 lot with tiered pricing (added in task 3.4)
 *   - 1 active campaign + 1 commitment + image uploads (added in task 3.5)
 *
 * Defaults to a from-scratch run (assumes a freshly-reset DB).
 * Pass --refresh to truncate seed-owned rows + delete tagged Stripe Connect
 * accounts before re-seeding (implemented in task 3.6).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ---- env loading -------------------------------------------------------

function loadDotenv(): void {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) {
    throw new Error(
      ".env.local not found. Copy .env.local.example to .env.local first.",
    );
  }
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = /^([A-Z_][A-Z_0-9]*)=(.*)$/.exec(trimmed);
    if (!m) continue;
    let value = m[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = value;
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

// ---- inline Stripe helper (dev-only — keeps lib/stripe.ts prod-clean) --

const STRIPE_API_BASE = "https://api.stripe.com/v1";

async function stripePost<T>(
  path: string,
  body: Record<string, string | number | boolean>,
): Promise<T> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) params.append(k, String(v));
  const res = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireEnv("STRIPE_SECRET_KEY")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  if (!res.ok) {
    throw new Error(`Stripe ${path} ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

interface StripeAccount {
  id: string;
  email: string | null;
}

async function createConnectAccount(email: string): Promise<StripeAccount> {
  return stripePost<StripeAccount>("/accounts", {
    type: "express",
    email,
    business_type: "company",
    "capabilities[card_payments][requested]": true,
    "capabilities[transfers][requested]": true,
    "metadata[crowdroast_seed]": "true",
  });
}

// ---- canonical fixtures -----------------------------------------------

const PASSWORD = "test-password-123";

interface UserSpec {
  email: string;
  user_metadata: {
    role: "hub_owner" | "seller" | "buyer";
    contact_name: string;
    company_name: string;
  };
}

const HUB_OWNER: UserSpec = {
  email: "hub-owner@crowdroast.local",
  user_metadata: {
    role: "hub_owner",
    contact_name: "Hub Owner Hank",
    company_name: "Roast Haven Hub",
  },
};

const SELLER: UserSpec = {
  email: "seller@crowdroast.local",
  user_metadata: {
    role: "seller",
    contact_name: "Seller Sam",
    company_name: "Sam's Specialty Beans",
  },
};

const BUYERS: UserSpec[] = [
  {
    email: "buyer-1@crowdroast.local",
    user_metadata: {
      role: "buyer",
      contact_name: "Buyer Bao",
      company_name: "Acorn Coffee",
    },
  },
  {
    email: "buyer-2@crowdroast.local",
    user_metadata: {
      role: "buyer",
      contact_name: "Buyer Bea",
      company_name: "Beanstalk Roasters",
    },
  },
  {
    email: "buyer-3@crowdroast.local",
    user_metadata: {
      role: "buyer",
      contact_name: "Buyer Bo",
      company_name: "Brewbird Cafe",
    },
  },
];

const HUB = {
  name: "Roast Haven Hub",
  address: "123 Brew St",
  city: "Austin",
  state: "TX",
  country: "USA",
  capacity_kg: 1000,
};

const LOT = {
  title: "Yirgacheffe Konga — Washed",
  origin_country: "Ethiopia",
  region: "Yirgacheffe",
  farm: "Konga Cooperative",
  variety: "Heirloom",
  process: "Washed",
  altitude_min: 1900,
  altitude_max: 2100,
  crop_year: "2025/26",
  score: 87.5,
  description: "Bright florals, citrus, jasmine. Honey body, clean finish.",
  total_quantity_kg: 200,
  min_commitment_kg: 5,
  price_per_kg: 18.5,
  currency: "USD",
  status: "active",
  flavor_notes: ["jasmine", "citrus", "honey"],
  certifications: ["organic"],
  // images: populated in task 3.5 after upload to Storage.
  // commitment_deadline: set in task 3.5 (past-dated for cron testing).
};

// Tier rows for the lot — buy more, pay less per kg.
const PRICING_TIERS = [
  { min_quantity_kg: 5, price_per_kg: 18.5 },
  { min_quantity_kg: 25, price_per_kg: 17.0 },
  { min_quantity_kg: 50, price_per_kg: 15.5 },
];

// Image filenames in scripts/seed-assets/ to upload to local Storage.
const LOT_IMAGE_FILES = ["lot-1.jpg", "lot-2.jpg", "lot-3.jpg"];

// Past-dated by this many days so the cron jobs have work to do.
const PAST_DAYS = 5;

// One paid commitment from the first buyer at the middle pricing tier.
const COMMITMENT_QUANTITY_KG = 50;
const COMMITMENT_PRICE_PER_KG = 17.0; // matches PRICING_TIERS[1]

// A min-not-met lot for buyer-1: realistic post-refund state so the
// commitments page renders a Closed Lots card / drawer in "refund" mode
// without having to step through the full charge → cron flow.
//
// Mirrors what app/api/payments/settle-deadlines/route.ts leaves behind:
// the cron issues a Stripe refund and writes status=cancelled /
// payment_status=cancelled on the commitment but does NOT touch
// refunded_amount_cents — so the drawer's refundDollarsFor() helper has
// to fall back to total_price for the displayed refund amount.
const MIN_NOT_MET_LOT = {
  title: "Sidamo Heirloom — Below Minimum Test",
  origin_country: "Ethiopia",
  region: "Sidamo",
  farm: "Tabe Burka Cooperative",
  variety: "Heirloom",
  process: "Washed",
  altitude_min: 1850,
  altitude_max: 2050,
  crop_year: "2025/26",
  score: 86.0,
  description:
    "Test fixture: charged buyer-1 then refunded after the campaign failed to hit minimum.",
  total_quantity_kg: 200,
  min_commitment_kg: 100, // intentionally above what buyer-1 will commit
  price_per_kg: 19.0,
  currency: "USD",
  status: "active",
  flavor_notes: ["bergamot", "stone fruit"],
  certifications: ["organic"],
};

const MIN_NOT_MET_PRICING_TIERS = [
  { min_quantity_kg: 100, price_per_kg: 19.0 },
  { min_quantity_kg: 150, price_per_kg: 17.5 },
];

// Buyer-1's commitment on the failed campaign. Below the 100kg minimum
// so the campaign couldn't have hit it.
const MIN_NOT_MET_QUANTITY_KG = 30;
const MIN_NOT_MET_PRICE_PER_KG = 19.0;

// A second lot that has NO campaign and a past expiry_date, so the
// lot-expiry cron has work to do (the main lot above has an active
// campaign, which lot-expiry intentionally skips).
const EXPIRED_LOT = {
  title: "Sidamo Natural — Expired Test Lot",
  origin_country: "Ethiopia",
  region: "Sidamo",
  variety: "Heirloom",
  process: "Natural",
  total_quantity_kg: 100,
  min_commitment_kg: 5,
  price_per_kg: 16.0,
  currency: "USD",
  status: "active", // lot-expiry only acts on active or fully_committed lots
};

// ---- seed steps -------------------------------------------------------

async function createUser(
  supabase: SupabaseClient,
  spec: UserSpec,
): Promise<string> {
  const { data, error } = await supabase.auth.admin.createUser({
    email: spec.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: spec.user_metadata,
  });
  if (error) throw error;
  return data.user.id;
}

async function setSellerConnectAccountId(
  supabase: SupabaseClient,
  sellerId: string,
  accountId: string,
): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ stripe_connect_account_id: accountId })
    .eq("id", sellerId);
  if (error) throw error;
}

async function createHub(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("hubs")
    .insert({ owner_id: ownerId, ...HUB })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function createBuyers(supabase: SupabaseClient): Promise<string[]> {
  const ids: string[] = [];
  for (const buyer of BUYERS) {
    ids.push(await createUser(supabase, buyer));
  }
  return ids;
}

async function createLot(
  supabase: SupabaseClient,
  sellerId: string,
  hubId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("lots")
    .insert({ seller_id: sellerId, hub_id: hubId, ...LOT })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function createPricingTiers(
  supabase: SupabaseClient,
  lotId: string,
): Promise<void> {
  const rows = PRICING_TIERS.map((t) => ({ lot_id: lotId, ...t }));
  const { error } = await supabase.from("pricing_tiers").insert(rows);
  if (error) throw error;
}

async function uploadLotImages(
  supabase: SupabaseClient,
  sellerId: string,
): Promise<string[]> {
  const urls: string[] = [];
  for (const filename of LOT_IMAGE_FILES) {
    const path = `${sellerId}/${filename}`;
    const buffer = readFileSync(resolve(process.cwd(), "scripts/seed-assets", filename));
    const { error: uploadErr } = await supabase.storage
      .from("lot-images")
      .upload(path, buffer, { contentType: "image/jpeg", upsert: true });
    if (uploadErr) throw uploadErr;

    const { data } = supabase.storage.from("lot-images").getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  return urls;
}

async function setLotImagesAndDeadlines(
  supabase: SupabaseClient,
  lotId: string,
  imageUrls: string[],
): Promise<void> {
  const past = new Date();
  past.setDate(past.getDate() - PAST_DAYS);
  const { error } = await supabase
    .from("lots")
    .update({
      images: imageUrls,
      commitment_deadline: past.toISOString(),
      expiry_date: past.toISOString(),
    })
    .eq("id", lotId);
  if (error) throw error;
}

async function createCampaign(
  supabase: SupabaseClient,
  lotId: string,
  hubId: string,
): Promise<string> {
  const past = new Date();
  past.setDate(past.getDate() - PAST_DAYS);
  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      lot_id: lotId,
      hub_id: hubId,
      deadline: past.toISOString(),
      status: "active",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function createExpiredOnlyLot(
  supabase: SupabaseClient,
  sellerId: string,
  hubId: string,
): Promise<string> {
  const past = new Date();
  past.setDate(past.getDate() - PAST_DAYS);
  const { data, error } = await supabase
    .from("lots")
    .insert({
      seller_id: sellerId,
      hub_id: hubId,
      ...EXPIRED_LOT,
      expiry_date: past.toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function createPaidCommitment(
  supabase: SupabaseClient,
  lotId: string,
  buyerId: string,
  hubId: string,
  campaignId: string,
): Promise<string> {
  const total_price = COMMITMENT_QUANTITY_KG * COMMITMENT_PRICE_PER_KG;
  const { data, error } = await supabase
    .from("commitments")
    .insert({
      lot_id: lotId,
      buyer_id: buyerId,
      hub_id: hubId,
      campaign_id: campaignId,
      quantity_kg: COMMITMENT_QUANTITY_KG,
      price_per_kg: COMMITMENT_PRICE_PER_KG,
      total_price,
      status: "confirmed",
      payment_status: "charge_succeeded",
      charge_amount_cents: Math.round(total_price * 100),
      charge_currency: "USD",
      charged_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function createMinNotMetLot(
  supabase: SupabaseClient,
  sellerId: string,
  hubId: string,
): Promise<string> {
  const past = new Date();
  past.setDate(past.getDate() - PAST_DAYS - 2);
  const { data, error } = await supabase
    .from("lots")
    .insert({
      seller_id: sellerId,
      hub_id: hubId,
      ...MIN_NOT_MET_LOT,
      committed_quantity_kg: MIN_NOT_MET_QUANTITY_KG,
      commitment_deadline: past.toISOString(),
      settlement_status: "minimum_not_met",
      settlement_processed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function createMinNotMetPricingTiers(
  supabase: SupabaseClient,
  lotId: string,
): Promise<void> {
  const rows = MIN_NOT_MET_PRICING_TIERS.map((t) => ({ lot_id: lotId, ...t }));
  const { error } = await supabase.from("pricing_tiers").insert(rows);
  if (error) throw error;
}

async function createFailedCampaign(
  supabase: SupabaseClient,
  lotId: string,
  hubId: string,
): Promise<string> {
  const past = new Date();
  past.setDate(past.getDate() - PAST_DAYS - 2);
  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      lot_id: lotId,
      hub_id: hubId,
      deadline: past.toISOString(),
      status: "failed",
      settled_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/**
 * Mirrors the post-cron state from app/api/payments/settle-deadlines after
 * it issues a Stripe refund on a min-not-met campaign:
 * - status: cancelled
 * - payment_status: cancelled
 * - stripe_payment_intent_id: present (charge happened)
 * - charge_amount_cents: still the original charged amount
 * - refunded_amount_cents: 0 (the cron does NOT update this — only the
 *   admin manual-refund route does)
 * - payment_error: "Refunded: ..."
 *
 * The drawer's refundDollarsFor() helper detects this shape via
 * payment_status=cancelled + a present payment_intent_id and falls back
 * to total_price as the displayed refund amount.
 */
async function createRefundedMinNotMetCommitment(
  supabase: SupabaseClient,
  lotId: string,
  buyerId: string,
  hubId: string,
  campaignId: string,
): Promise<string> {
  const total_price = MIN_NOT_MET_QUANTITY_KG * MIN_NOT_MET_PRICE_PER_KG;
  const chargedAt = new Date();
  chargedAt.setDate(chargedAt.getDate() - PAST_DAYS - 1);
  const { data, error } = await supabase
    .from("commitments")
    .insert({
      lot_id: lotId,
      buyer_id: buyerId,
      hub_id: hubId,
      campaign_id: campaignId,
      quantity_kg: MIN_NOT_MET_QUANTITY_KG,
      price_per_kg: MIN_NOT_MET_PRICE_PER_KG,
      total_price,
      status: "cancelled",
      payment_status: "cancelled",
      charge_amount_cents: Math.round(total_price * 100),
      charge_currency: "USD",
      charged_at: chargedAt.toISOString(),
      stripe_payment_intent_id: `pi_seed_minnotmet_${Date.now()}`,
      payment_error: "Refunded: lot minimum not met by deadline",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

// ---- buyer-referral fixture -----------------------------------------------
// Sets up a settle-eligible flow where buyer-1 invited buyer-2:
//
//   - invite_codes row for buyer-1 (code: 'seedinvite')
//   - buyer-1 + buyer-2 are active members of the hub
//   - buyer-2's profile is attributed to buyer-1 (mirrors the trigger)
//   - a fresh lot + active campaign past-deadline + committed quantity
//     above minimum, with buyer-2's commitment in 'charge_succeeded'
//   - a referral_attributions(pending) row linking buyer-1 → buyer-2 via
//     this commitment
//
// Running settle-deadlines against this state should: settle the campaign,
// flip the attribution to 'earned', and insert a +$10 credit_ledger row
// for buyer-1. Used for manual QA in Stage 4.

const REFERRAL_INVITE_CODE = "seedinvite";

const REFERRAL_LOT = {
  title: "Yirgacheffe G1 — Referral Settle Test",
  origin_country: "Ethiopia",
  region: "Yirgacheffe",
  farm: "Konga Cooperative",
  variety: "Heirloom",
  process: "Washed",
  altitude_min: 1900,
  altitude_max: 2100,
  crop_year: "2025/26",
  score: 87.5,
  description:
    "Test fixture: buyer-2 was invited by buyer-1, charge succeeded, campaign meets minimum. Run settle-deadlines to earn buyer-1 their $10 credit.",
  total_quantity_kg: 100,
  min_commitment_kg: 25,
  price_per_kg: 22.0,
  currency: "USD",
  status: "active",
  flavor_notes: ["jasmine", "lemon"],
  certifications: [],
};

const REFERRAL_QUANTITY_KG = 30;
const REFERRAL_PRICE_PER_KG = 22.0;

async function ensureHubMember(
  supabase: SupabaseClient,
  hubId: string,
  userId: string,
  invitedByUserId: string | null,
): Promise<void> {
  // hub_members has partial unique indexes only:
  //   - (user_id) WHERE status='active'      — one active hub per buyer
  //   - (hub_id, user_id) WHERE user_id IS NOT NULL
  // Supabase .upsert needs a non-partial constraint to target, so do an
  // explicit existence check then insert. Idempotent on re-run.
  const { data: existing } = await supabase
    .from("hub_members")
    .select("id, hub_id, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (existing) return; // user is already active somewhere — leave it alone

  const { error } = await supabase.from("hub_members").insert({
    hub_id: hubId,
    user_id: userId,
    status: "active",
    role: "buyer",
    joined_at: new Date().toISOString(),
    invited_by_user_id: invitedByUserId,
  });
  if (error && error.code !== "23505") throw error;
}

async function createReferralInviteCode(
  supabase: SupabaseClient,
  inviterUserId: string,
  hubId: string,
): Promise<void> {
  const { error } = await supabase.from("invite_codes").insert({
    code: REFERRAL_INVITE_CODE,
    inviter_user_id: inviterUserId,
    hub_id: hubId,
  });
  if (error && error.code !== "23505") throw error;
}

async function attributeBuyerToInviter(
  supabase: SupabaseClient,
  inviteeId: string,
  inviterId: string,
): Promise<void> {
  // The lock-once trigger blocks updates if invited_by_user_id is already
  // set to a different value, so this is safe-to-rerun only when the
  // existing value is null or already equals inviterId.
  const { error } = await supabase
    .from("profiles")
    .update({
      invited_by_user_id: inviterId,
      invite_code_used: REFERRAL_INVITE_CODE,
    })
    .eq("id", inviteeId)
    .is("invited_by_user_id", null);
  if (error) throw error;
}

async function createReferralLot(
  supabase: SupabaseClient,
  sellerId: string,
  hubId: string,
): Promise<string> {
  const past = new Date();
  past.setDate(past.getDate() - PAST_DAYS - 2);
  const { data, error } = await supabase
    .from("lots")
    .insert({
      seller_id: sellerId,
      hub_id: hubId,
      ...REFERRAL_LOT,
      committed_quantity_kg: REFERRAL_QUANTITY_KG,
      commitment_deadline: past.toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function createReferralCampaign(
  supabase: SupabaseClient,
  lotId: string,
  hubId: string,
): Promise<string> {
  const past = new Date();
  past.setDate(past.getDate() - PAST_DAYS - 2);
  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      lot_id: lotId,
      hub_id: hubId,
      deadline: past.toISOString(),
      status: "active",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function createReferralPaidCommitment(
  supabase: SupabaseClient,
  lotId: string,
  buyerId: string,
  hubId: string,
  campaignId: string,
): Promise<string> {
  const total_price = REFERRAL_QUANTITY_KG * REFERRAL_PRICE_PER_KG;
  const chargedAt = new Date();
  chargedAt.setDate(chargedAt.getDate() - PAST_DAYS - 1);
  const { data, error } = await supabase
    .from("commitments")
    .insert({
      lot_id: lotId,
      buyer_id: buyerId,
      hub_id: hubId,
      campaign_id: campaignId,
      quantity_kg: REFERRAL_QUANTITY_KG,
      price_per_kg: REFERRAL_PRICE_PER_KG,
      total_price,
      status: "confirmed",
      payment_status: "charge_succeeded",
      charge_amount_cents: Math.round(total_price * 100),
      charge_currency: "USD",
      charged_at: chargedAt.toISOString(),
      stripe_payment_intent_id: `pi_seed_referral_${Date.now()}`,
      stripe_charge_id: `ch_seed_referral_${Date.now()}`,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function createPendingReferralAttribution(
  supabase: SupabaseClient,
  inviterId: string,
  inviteeId: string,
  commitmentId: string,
  campaignId: string,
): Promise<void> {
  const { error } = await supabase.from("referral_attributions").insert({
    inviter_user_id: inviterId,
    invitee_user_id: inviteeId,
    commitment_id: commitmentId,
    campaign_id: campaignId,
    status: "pending",
  });
  if (error && error.code !== "23505") throw error;
}

// ---- main -------------------------------------------------------------

async function main() {
  loadDotenv();

  const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const STRIPE_KEY = requireEnv("STRIPE_SECRET_KEY");

  const host = new URL(SUPABASE_URL).hostname;
  if (!["localhost", "127.0.0.1", "0.0.0.0"].includes(host)) {
    throw new Error(
      `Refusing to seed against non-local Supabase: ${host}.\n` +
        `Set NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 in .env.local.`,
    );
  }
  if (!STRIPE_KEY.startsWith("sk_test_")) {
    throw new Error(
      `Refusing to seed with non-sandbox Stripe key. ` +
        `STRIPE_SECRET_KEY must start with sk_test_.`,
    );
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const isRefresh = process.argv.includes("--refresh");
  if (isRefresh) {
    await refresh(supabase);
  }

  console.log("Seed starting...\n");
  try {
    const hubOwnerId = await createUser(supabase, HUB_OWNER);
    console.log(`✓ Hub owner created (${HUB_OWNER.email})`);

    const sellerId = await createUser(supabase, SELLER);
    console.log(`✓ Seller created (${SELLER.email})`);

    const connectAccount = await createConnectAccount(SELLER.email);
    console.log(`✓ Stripe Connect account: ${connectAccount.id}`);

    await setSellerConnectAccountId(supabase, sellerId, connectAccount.id);
    console.log(`✓ Seller profile linked to Connect account`);

    const hubId = await createHub(supabase, hubOwnerId);
    console.log(`✓ Hub created: ${hubId}`);

    const buyerIds = await createBuyers(supabase);
    console.log(`✓ ${buyerIds.length} buyers created`);

    const lotId = await createLot(supabase, sellerId, hubId);
    console.log(`✓ Lot created: ${lotId}`);

    await createPricingTiers(supabase, lotId);
    console.log(`✓ ${PRICING_TIERS.length} pricing tiers created`);

    const imageUrls = await uploadLotImages(supabase, sellerId);
    console.log(`✓ ${imageUrls.length} lot images uploaded to Storage`);

    await setLotImagesAndDeadlines(supabase, lotId, imageUrls);
    console.log(`✓ Lot images + past-dated deadlines set`);

    const campaignId = await createCampaign(supabase, lotId, hubId);
    console.log(`✓ Active campaign created (deadline ${PAST_DAYS} days ago): ${campaignId}`);

    const commitmentId = await createPaidCommitment(
      supabase,
      lotId,
      buyerIds[0],
      hubId,
      campaignId,
    );
    console.log(`✓ Paid commitment created: ${commitmentId}`);

    const expiredLotId = await createExpiredOnlyLot(supabase, sellerId, hubId);
    console.log(`✓ Expired-only lot created (for lot-expiry cron): ${expiredLotId}`);

    const minNotMetLotId = await createMinNotMetLot(supabase, sellerId, hubId);
    console.log(`✓ Min-not-met lot created: ${minNotMetLotId}`);

    await createMinNotMetPricingTiers(supabase, minNotMetLotId);
    console.log(`✓ ${MIN_NOT_MET_PRICING_TIERS.length} pricing tiers created for min-not-met lot`);

    const failedCampaignId = await createFailedCampaign(
      supabase,
      minNotMetLotId,
      hubId,
    );
    console.log(`✓ Failed campaign created: ${failedCampaignId}`);

    const refundedCommitmentId = await createRefundedMinNotMetCommitment(
      supabase,
      minNotMetLotId,
      buyerIds[0],
      hubId,
      failedCampaignId,
    );
    console.log(
      `✓ Refunded commitment for buyer-1 on failed campaign: ${refundedCommitmentId}`,
    );

    // ---- buyer-referral fixture: buyer-1 invited buyer-2 ----
    if (buyerIds.length >= 2) {
      await ensureHubMember(supabase, hubId, buyerIds[0], null);
      await ensureHubMember(supabase, hubId, buyerIds[1], buyerIds[0]);
      console.log("✓ buyer-1 and buyer-2 active in hub for referral fixture");

      await createReferralInviteCode(supabase, buyerIds[0], hubId);
      console.log(`✓ Invite code created: ${REFERRAL_INVITE_CODE}`);

      await attributeBuyerToInviter(supabase, buyerIds[1], buyerIds[0]);
      console.log("✓ buyer-2 attributed to buyer-1");

      const referralLotId = await createReferralLot(supabase, sellerId, hubId);
      console.log(`✓ Referral settle-success lot: ${referralLotId}`);

      const referralCampaignId = await createReferralCampaign(supabase, referralLotId, hubId);
      console.log(`✓ Referral campaign (past deadline, meets min): ${referralCampaignId}`);

      const referralCommitmentId = await createReferralPaidCommitment(
        supabase,
        referralLotId,
        buyerIds[1],
        hubId,
        referralCampaignId,
      );
      console.log(`✓ buyer-2 charge_succeeded commitment: ${referralCommitmentId}`);

      await createPendingReferralAttribution(
        supabase,
        buyerIds[0],
        buyerIds[1],
        referralCommitmentId,
        referralCampaignId,
      );
      console.log("✓ Pending referral_attribution row inserted (run settle-deadlines to earn it)");
    } else {
      console.log("⚠ Skipping buyer-referral fixture (need at least 2 buyers).");
    }

    console.log("\nSeed completed.");
  } catch (err) {
    console.error("\nSeed failed mid-run. Re-run with --refresh to clean up partial state.");
    throw err;
  }
}

// ---- refresh path ----------------------------------------------------

const SEED_EMAILS: string[] = [
  HUB_OWNER.email,
  SELLER.email,
  ...BUYERS.map((b) => b.email),
];

async function deleteSeedConnectAccounts(): Promise<void> {
  let startingAfter: string | undefined;
  let totalDeleted = 0;
  while (true) {
    const url = new URL(`${STRIPE_API_BASE}/accounts`);
    url.searchParams.set("limit", "100");
    if (startingAfter) url.searchParams.set("starting_after", startingAfter);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${requireEnv("STRIPE_SECRET_KEY")}` },
    });
    if (!res.ok) {
      throw new Error(`Stripe list accounts ${res.status}: ${await res.text()}`);
    }
    const body = (await res.json()) as {
      data: Array<{ id: string; metadata?: Record<string, string> }>;
      has_more: boolean;
    };

    let lastId: string | undefined;
    for (const acct of body.data) {
      lastId = acct.id;
      if (acct.metadata?.crowdroast_seed === "true") {
        const delRes = await fetch(`${STRIPE_API_BASE}/accounts/${acct.id}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${requireEnv("STRIPE_SECRET_KEY")}`,
          },
        });
        if (!delRes.ok) {
          throw new Error(
            `Stripe delete account ${acct.id} ${delRes.status}: ${await delRes.text()}`,
          );
        }
        totalDeleted += 1;
      }
    }

    if (!body.has_more || !lastId) break;
    startingAfter = lastId;
  }
  console.log(`  ✓ Deleted ${totalDeleted} tagged Stripe Connect account(s)`);
}

async function deleteSeedAuthUsers(supabase: SupabaseClient): Promise<void> {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const seedUsers = data.users.filter((u) =>
    SEED_EMAILS.includes(u.email ?? ""),
  );
  for (const user of seedUsers) {
    const { error: delErr } = await supabase.auth.admin.deleteUser(user.id);
    if (delErr) throw delErr;
  }
  console.log(`  ✓ Deleted ${seedUsers.length} seed auth user(s) (cascades to profiles + downstream rows)`);
}

async function refresh(supabase: SupabaseClient): Promise<void> {
  console.log("Refresh: cleaning up previous seed state...");
  // Order matters: kill Stripe accounts first (they're external state we
  // need to track via local references). Then delete auth users — that
  // cascade-deletes profiles → lots → campaigns → commitments →
  // pricing_tiers → hubs in one shot.
  await deleteSeedConnectAccounts();
  await deleteSeedAuthUsers(supabase);
  console.log("Refresh complete. Re-seeding...\n");
}

main().catch((err) => {
  console.error("\nSeed failed:", err);
  process.exit(1);
});

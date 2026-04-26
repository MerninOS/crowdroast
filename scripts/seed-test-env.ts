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

const HUB_OWNER = {
  email: "hub-owner@crowdroast.local",
  user_metadata: {
    role: "hub_owner",
    contact_name: "Hub Owner Hank",
    company_name: "Roast Haven Hub",
  },
};

const SELLER = {
  email: "seller@crowdroast.local",
  user_metadata: {
    role: "seller",
    contact_name: "Seller Sam",
    company_name: "Sam's Specialty Beans",
  },
};

const HUB = {
  name: "Roast Haven Hub",
  address: "123 Brew St",
  city: "Austin",
  state: "TX",
  country: "USA",
  capacity_kg: 1000,
};

// ---- seed steps -------------------------------------------------------

async function startSeedRun(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase
    .from("_seed_runs")
    .insert({ status: "running" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function finishSeedRun(
  supabase: SupabaseClient,
  id: string,
  status: "completed" | "failed",
): Promise<void> {
  await supabase
    .from("_seed_runs")
    .update({ status, completed_at: new Date().toISOString() })
    .eq("id", id);
}

async function createUser(
  supabase: SupabaseClient,
  spec: typeof HUB_OWNER,
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

  const seedRunId = await startSeedRun(supabase);
  console.log(`Seed run started: ${seedRunId}`);

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

    // Task 3.4 extends here: buyers + lot + tiered pricing.
    // Task 3.5 extends here: image uploads + campaign + commitment.

    await finishSeedRun(supabase, seedRunId, "completed");
    console.log("\nSeed completed.");
  } catch (err) {
    await finishSeedRun(supabase, seedRunId, "failed");
    throw err;
  }
}

// Task 3.6 implements the body of refresh().
async function refresh(_supabase: SupabaseClient): Promise<void> {
  throw new Error("--refresh not yet implemented (task 3.6)");
}

main().catch((err) => {
  console.error("\nSeed failed:", err);
  process.exit(1);
});

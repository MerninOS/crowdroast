#!/usr/bin/env tsx
/**
 * Local trigger for /api/cron/lot-expiry.
 *
 * Calls the route with the Bearer auth path (same as Vercel cron),
 * then queries the local DB to assert the seeded "Expired Test Lot"
 * transitioned from status='active' → status='expired'.
 *
 * The seed creates a second lot with no campaign and a past
 * expiry_date specifically so this cron has work to do; the main
 * lot has an active campaign and is intentionally skipped by the
 * route.
 *
 * Requires: dev server running on NEXT_PUBLIC_APP_URL, db seeded.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadDotenv(): void {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) throw new Error(".env.local not found.");
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

async function callRoute(appUrl: string, cronSecret: string): Promise<void> {
  const url = `${appUrl}/api/cron/lot-expiry`;
  console.log(`GET ${url}`);
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${cronSecret}` },
  });
  const body = await res.text();
  if (res.status === 401) {
    console.error(
      "\n401 Unauthorized — CRON_SECRET in .env.local doesn't match the value the route is reading.",
    );
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`\nRoute returned ${res.status}: ${body}`);
    process.exit(1);
  }
  console.log(`Route returned ${res.status}.`);
  console.log(body);
}

async function assertExpiredLotMarked(supabase: SupabaseClient): Promise<void> {
  const { data: lots, error } = await supabase
    .from("lots")
    .select("id, title, status, settlement_status, settlement_processed_at")
    .ilike("title", "%Expired Test Lot%");
  if (error) throw error;
  if (!lots || lots.length === 0) {
    console.error(
      "\nSeeded 'Expired Test Lot' not found — has the DB been seeded? Run npm run db:seed first.",
    );
    process.exit(1);
  }
  const lot = lots[0];
  if (lot.status !== "expired") {
    console.error(
      `\nFAIL: expected lot ${lot.id} to be status='expired' after lot-expiry, got status='${lot.status}'.`,
    );
    process.exit(1);
  }
  console.log(
    `\n✓ Lot transitioned to 'expired'. settlement_status='${lot.settlement_status}', settlement_processed_at=${lot.settlement_processed_at}`,
  );
}

async function main() {
  loadDotenv();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const cronSecret = requireEnv("CRON_SECRET");
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  await callRoute(appUrl, cronSecret);

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await assertExpiredLotMarked(supabase);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

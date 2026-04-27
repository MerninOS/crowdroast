#!/usr/bin/env tsx
/**
 * Local trigger for /api/payments/settle-deadlines.
 *
 * Calls the route with the Bearer auth path (same as Vercel cron),
 * then queries the local DB to assert the seeded canonical campaign
 * actually transitioned out of 'active'.
 *
 * Requires: dev server running on NEXT_PUBLIC_APP_URL, db seeded.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadDotenv(): void {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) {
    throw new Error(".env.local not found.");
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

async function callRoute(appUrl: string, cronSecret: string): Promise<void> {
  const url = `${appUrl}/api/payments/settle-deadlines`;
  console.log(`POST ${url}`);
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${cronSecret}` },
  });
  const body = await res.text();
  if (res.status === 401) {
    console.error(
      "\n401 Unauthorized — CRON_SECRET in .env.local doesn't match the value the route is reading.",
    );
    console.error("Check: same value in both wrapper env and route env.");
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`\nRoute returned ${res.status}: ${body}`);
    process.exit(1);
  }
  console.log(`Route returned ${res.status}.`);
  console.log(body);
}

async function assertCampaignTransitioned(
  supabase: SupabaseClient,
): Promise<void> {
  const { data: campaigns, error } = await supabase
    .from("campaigns")
    .select("id, status, settled_at, lot_id");
  if (error) throw error;
  if (!campaigns || campaigns.length === 0) {
    console.error("\nNo campaigns found — has the DB been seeded? Run npm run db:seed first.");
    process.exit(1);
  }

  const stillActive = campaigns.filter((c) => c.status === "active");
  if (stillActive.length > 0) {
    console.error(
      `\nFAIL: ${stillActive.length} campaign(s) still 'active' after settle-deadlines:`,
    );
    for (const c of stillActive) {
      console.error(`  - ${c.id} (lot ${c.lot_id})`);
    }
    process.exit(1);
  }

  const transitioned = campaigns.length;
  console.log(
    `\n✓ All ${transitioned} campaign(s) transitioned out of 'active'. Statuses:`,
  );
  for (const c of campaigns) {
    console.log(`  - ${c.id}: ${c.status}${c.settled_at ? ` (settled_at=${c.settled_at})` : ""}`);
  }
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
  await assertCampaignTransitioned(supabase);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

#!/usr/bin/env tsx
/**
 * Push schema migrations from this dev box to PROD.
 *
 * Pre-flight: every file under supabase/migrations/ must already be
 * applied to the local DB. If any local-only file exists, we abort.
 * This catches the "I wrote a migration and never tested it" footgun
 * before it hits prod.
 *
 * After the pre-flight passes we hand off to `supabase db push --linked`
 * which shows its own diff and confirmation prompt before applying.
 *
 * Requires: prior `supabase login` + `supabase link --project-ref <prod>`.
 * Requires: bootstrap script run on prod before the first invocation
 *           (see scripts/db-bootstrap-prod-ledger.ts).
 */

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");
const TIMESTAMP_RE = /^(\d{14})_/;
const LIST_LINE_RE = /^\s*(\d{14})\s*\|/;

function fileTimestamps(): string[] {
  const out: string[] = [];
  for (const f of readdirSync(MIGRATIONS_DIR)) {
    const m = TIMESTAMP_RE.exec(f);
    if (m) out.push(m[1]);
  }
  return out.sort();
}

function locallyApplied(): string[] {
  const res = spawnSync("supabase", ["migration", "list", "--local"], {
    encoding: "utf8",
  });
  if (res.status !== 0) {
    throw new Error(
      `supabase migration list --local failed: ${res.stderr || res.stdout}`,
    );
  }
  const out: string[] = [];
  for (const line of res.stdout.split("\n")) {
    const m = LIST_LINE_RE.exec(line);
    if (m) out.push(m[1]);
  }
  return out.sort();
}

function preflight(): void {
  const files = fileTimestamps();
  const applied = new Set(locallyApplied());
  const localOnly = files.filter((t) => !applied.has(t));

  if (localOnly.length > 0) {
    console.error(
      "\nMigration files exist locally but have NOT been applied to the local DB:",
    );
    for (const ts of localOnly) console.error(`  - ${ts}`);
    console.error(
      "\nRun `npm run dev:up` (or `supabase db reset`) to apply them locally first.",
    );
    console.error(
      "Verify they work end-to-end before pushing them to prod — that's the whole point of this guard.",
    );
    process.exit(1);
  }

  console.log(`Pre-flight ✓ — all ${files.length} migrations applied locally.`);
}

function pushToProd(): never {
  const banner = "  Pushing migrations to PROD  ";
  const line = "═".repeat(banner.length);
  console.log(`\n\x1b[31m\x1b[1m${line}\x1b[0m`);
  console.log(`\x1b[31m\x1b[1m${banner}\x1b[0m`);
  console.log(`\x1b[31m\x1b[1m${line}\x1b[0m\n`);

  const push = spawnSync("supabase", ["db", "push", "--linked"], {
    stdio: "inherit",
  });
  process.exit(push.status ?? 1);
}

function main(): void {
  preflight();
  pushToProd();
}

main();

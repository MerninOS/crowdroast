#!/usr/bin/env tsx
/**
 * CI guard — fails the build if migration files exist in this branch
 * that have not yet been applied to the prod Supabase ledger.
 *
 * Without this check, a developer could merge a PR containing a new
 * migration file without first running `npm run db:migrate:prod`, and
 * the next deploy would boot against a prod schema missing the new
 * tables/columns. CI catches that here, before merge.
 *
 * This file also exports `diffMigrations` and `parseListOutput` as pure
 * functions so the diffing logic is unit-testable without hitting any
 * real Supabase project.
 *
 * Requires (when invoked as CLI): `supabase login` + a Supabase access
 * token in the environment that has read access to the linked project.
 */

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");
const FILE_TIMESTAMP_RE = /^(\d{14})_/;
// Either column may be blank for a given row: Local-only (remote blank)
// or Remote-only (local blank) — both forms are valid table rows.
const LIST_LINE_RE = /^\s*(\d{14})?\s*\|\s*(\d{14})?\s*\|/;

// ---- pure functions (unit-testable) -----------------------------------

/**
 * Parse the table output of `supabase migration list --linked`.
 *
 * The CLI prints two columns per row — Local (this dev box's ledger)
 * and Remote (prod's ledger). Either column may be empty for a given
 * row when one side has a migration the other doesn't. We return the
 * timestamps the REMOTE side has applied.
 */
export function parseRemoteApplied(stdout: string): string[] {
  const out: string[] = [];
  for (const line of stdout.split("\n")) {
    const m = LIST_LINE_RE.exec(line);
    if (!m) continue;
    const remote = m[2];
    if (remote) out.push(remote);
  }
  return out.sort();
}

/**
 * Compute which local migration files have not yet been applied to the
 * remote ledger. Local-only entries fail the guard.
 *
 * Files in the remote ledger that are NOT in the local file list are
 * NOT an error here — that just means prod has migrations from a future
 * branch. We only care about the dev → prod direction.
 */
export function diffMigrations(
  localFiles: string[],
  remoteApplied: string[],
): { unapplied: string[] } {
  const remoteSet = new Set(remoteApplied);
  const unapplied = localFiles.filter((t) => !remoteSet.has(t));
  return { unapplied };
}

// ---- CLI side ---------------------------------------------------------

function fileTimestamps(): string[] {
  const out: string[] = [];
  for (const f of readdirSync(MIGRATIONS_DIR)) {
    const m = FILE_TIMESTAMP_RE.exec(f);
    if (m) out.push(m[1]);
  }
  return out.sort();
}

function fetchRemoteApplied(): string[] {
  const res = spawnSync("supabase", ["migration", "list", "--linked"], {
    encoding: "utf8",
  });
  if (res.status !== 0) {
    throw new Error(
      `supabase migration list --linked failed: ${res.stderr || res.stdout}\n` +
        `Are you logged in (supabase login) and linked (supabase link --project-ref <ref>)?`,
    );
  }
  return parseRemoteApplied(res.stdout);
}

function main(): void {
  const files = fileTimestamps();
  const remote = fetchRemoteApplied();
  const { unapplied } = diffMigrations(files, remote);

  if (unapplied.length === 0) {
    console.log(`✓ All ${files.length} migrations are applied on prod.`);
    return;
  }

  console.error(
    `\n${unapplied.length} migration(s) exist in this branch but have NOT been applied to prod:`,
  );
  for (const ts of unapplied) console.error(`  - ${ts}`);
  console.error(
    "\nRun `npm run db:migrate:prod` from this branch before merging.",
  );
  console.error(
    "(Or revert the offending migration file if it should not ship.)",
  );
  process.exit(1);
}

// Run as CLI when invoked directly; do nothing when imported (e.g. by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

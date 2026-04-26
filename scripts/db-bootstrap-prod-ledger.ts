#!/usr/bin/env tsx

import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { resolve } from "node:path";

const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");
const TIMESTAMP_RE = /^(\d{14})_/;

const dryRun = process.argv.includes("--dry-run");

function readMigrationTimestamps(): string[] {
  const files = readdirSync(MIGRATIONS_DIR);
  const timestamps: string[] = [];
  for (const file of files) {
    const match = TIMESTAMP_RE.exec(file);
    if (match) timestamps.push(match[1]);
  }
  return timestamps.sort();
}

function confirm(prompt: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => {
    rl.question(prompt, (answer) => {
      rl.close();
      res(answer.trim().toUpperCase() === "BOOTSTRAP");
    });
  });
}

function repair(timestamp: string): { ok: boolean; output: string } {
  const result = spawnSync(
    "supabase",
    ["migration", "repair", "--status", "applied", timestamp, "--linked"],
    { encoding: "utf8" },
  );
  const output = (result.stdout || "") + (result.stderr || "");
  return { ok: result.status === 0, output };
}

async function main() {
  const timestamps = readMigrationTimestamps();
  if (timestamps.length === 0) {
    console.error(`No migration files found in ${MIGRATIONS_DIR}`);
    process.exit(1);
  }

  console.log(`Found ${timestamps.length} migrations to mark as applied on PROD:`);
  for (const ts of timestamps) console.log(`  - ${ts}`);

  if (dryRun) {
    console.log("\n[--dry-run] No changes made. Re-run without --dry-run to apply.");
    return;
  }

  console.log(
    "\nThis will mark every migration above as applied in the LINKED PROD project's ledger.",
  );
  console.log("It does not run any SQL — it only updates schema_migrations.");
  console.log("Idempotent: re-running for an already-marked file is a no-op.\n");

  const ok = await confirm("Type BOOTSTRAP to continue: ");
  if (!ok) {
    console.log("Aborted.");
    process.exit(1);
  }

  let failed = 0;
  for (const ts of timestamps) {
    process.stdout.write(`Marking ${ts}... `);
    const { ok, output } = repair(ts);
    if (ok) {
      console.log("ok");
    } else {
      console.log("FAIL");
      console.error(output);
      failed += 1;
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} of ${timestamps.length} migrations failed to mark.`);
    console.error("Re-run the script — `migration repair` is idempotent for already-marked entries.");
    process.exit(1);
  }

  console.log(`\nAll ${timestamps.length} migrations marked as applied on prod.`);
  console.log("Verify with: supabase migration list --linked");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

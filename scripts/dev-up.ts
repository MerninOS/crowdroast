#!/usr/bin/env tsx
/**
 * Bring up a fresh local dev environment: local Supabase + applied
 * migrations + seeded canonical cast + Next dev server.
 *
 * Destructive by design — `supabase db reset` wipes the local DB.
 * If you want to reseed without wiping, use `npm run db:seed:refresh`.
 */

import { spawnSync, spawn } from "node:child_process";

interface Step {
  name: string;
  cmd: string;
  args: string[];
  /** When true, this step replaces the orchestrator process (long-running). */
  exec?: boolean;
}

const STEPS: Step[] = [
  { name: "Boot local Supabase stack", cmd: "supabase", args: ["start"] },
  {
    name: "Reset local DB and apply migrations",
    cmd: "supabase",
    args: ["db", "reset"],
  },
  { name: "Seed canonical cast", cmd: "npx", args: ["tsx", "scripts/seed-test-env.ts"] },
  { name: "Start Next.js dev server", cmd: "npm", args: ["run", "dev"], exec: true },
];

function header(text: string): void {
  const line = "─".repeat(text.length + 4);
  console.log(`\n${line}\n  ${text}\n${line}`);
}

function runStep(step: Step): void {
  if (step.exec) {
    // Long-running step: replace orchestrator with the child so Ctrl-C
    // and stdio behave naturally for the user.
    header(step.name);
    const child = spawn(step.cmd, step.args, { stdio: "inherit" });
    child.on("exit", (code) => process.exit(code ?? 0));
    return;
  }

  header(step.name);
  const res = spawnSync(step.cmd, step.args, { stdio: "inherit" });
  if (res.status !== 0) {
    console.error(`\n${step.name} failed (exit ${res.status}). Aborting dev:up.`);
    process.exit(res.status ?? 1);
  }
}

function main(): void {
  console.log("dev:up — bringing up CrowdRoast dev environment\n");
  for (const step of STEPS) runStep(step);
}

main();

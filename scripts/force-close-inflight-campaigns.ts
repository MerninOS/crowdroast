#!/usr/bin/env tsx
/**
 * force-close-inflight-campaigns.ts
 *
 * One-shot deploy-time script. Force-closes every `active` campaign,
 * bridging the OLD charge-on-commit model and the NEW charge-on-fill
 * (bag-aware) model so no live commit gets stranded mid-cutover.
 *
 * WHAT IT DOES
 * ------------
 * For every campaign with status='active' at run time:
 *   1. Loads its commitments.
 *   2. For each commit:
 *      - If `stripe_payment_intent_id IS NOT NULL` → OLD model: money was
 *        captured at commit time via Checkout Session. Issue a full Stripe
 *        refund. The buyer is made whole.
 *      - If `stripe_setup_intent_id IS NOT NULL` and `stripe_payment_intent_id IS NULL`
 *        → NEW model: only the card was saved (setup_intent); nothing was
 *        charged. Nothing to refund. The commit is cancelled when the
 *        campaign is finalized.
 *      - If both NULL → orphan / nothing was ever attempted. Nothing to
 *        refund. Cancelled as part of finalize.
 *   3. Calls `finalizeCampaign(admin, campaignId, 'failed')` which atomically:
 *      - flips the campaign to `failed`
 *      - cancels remaining non-confirmed commits
 *      - recycles the lot (clears hub_lots, sets lots.status='awaiting_relist',
 *        zeroes committed_quantity_kg)
 *
 * WHEN TO RUN
 * -----------
 *   - Before deploying the Stage 4 (charge-on-fill) changes to prod, so no
 *     live in-flight campaign gets caught between models.
 *   - Order with the Vercel deploy doesn't strictly matter — this script
 *     only talks to Stripe + Supabase directly, not the Next.js route. But
 *     prefer running it RIGHT BEFORE the deploy so the active-campaign list
 *     reflects whatever buyers committed up to the last moment of the old
 *     code being live.
 *
 * DRY-RUN FIRST CONVENTION
 * ------------------------
 *   ALWAYS run with `--dry-run` first (the default). The script prints
 *   exactly what it would do — refund $ amounts, commits cancelled,
 *   campaigns finalized — without touching Stripe or Supabase. Eyeball
 *   the output, then re-run with `--apply` to execute.
 *
 *   Usage:
 *     pnpm tsx scripts/force-close-inflight-campaigns.ts            # dry-run
 *     pnpm tsx scripts/force-close-inflight-campaigns.ts --dry-run  # explicit
 *     pnpm tsx scripts/force-close-inflight-campaigns.ts --apply    # execute
 *
 * OUT OF SCOPE (flagged here, not done)
 * -------------------------------------
 *   - Buyer email notifications. The settle-deadlines route fires emails
 *     via sendLotFailedNotifications; this script intentionally does NOT
 *     so ops can decide on a case-by-case basis whether buyers should hear
 *     about a refund that was driven by a model cutover rather than a
 *     campaign actually failing on merits. Follow-up if needed.
 *   - Hub-fee / seller-transfer reversals. createRefund refunds the buyer
 *     from the platform's balance. Any already-transferred amounts to
 *     seller/hub Connect accounts will need MANUAL reconciliation against
 *     the Stripe dashboard after the script runs. The script flags this
 *     in its final summary.
 *   - This script is NOT invoked from any cron / production trigger. It
 *     is a deploy-time human-operator tool.
 *
 * ENV REQUIRED
 * ------------
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   STRIPE_SECRET_KEY (for --apply only; lib/stripe.ts reads it)
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createAdminClient } from "@/lib/supabase/admin";
import { finalizeCampaign } from "@/lib/lots/finalize-campaign";
import { createRefund } from "@/lib/stripe";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

type Mode = "dry-run" | "apply";

function parseArgs(argv: readonly string[]): Mode {
  const flags = new Set(argv.slice(2));
  if (flags.has("--apply") && flags.has("--dry-run")) {
    throw new Error(
      "Pass either --apply OR --dry-run, not both. Default is --dry-run."
    );
  }
  if (flags.has("--apply")) return "apply";
  return "dry-run";
}

// ---------------------------------------------------------------------------
// dotenv (mirrors the convention of other scripts/*.ts — no extra deps)
// ---------------------------------------------------------------------------

function loadDotenv(): void {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return; // env may be injected by the shell
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

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

function info(msg: string): void {
  console.log(`[INFO] ${msg}`);
}
function warn(msg: string): void {
  console.log(`[WARN] ${msg}`);
}
function planLine(mode: Mode, msg: string): void {
  console.log(`[${mode === "apply" ? "APPLY" : "DRY"}] ${msg}`);
}

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CommitmentRow = {
  id: string;
  buyer_id: string | null;
  quantity_kg: number | null;
  status: string | null;
  payment_status: string | null;
  charge_amount_cents: number | null;
  total_price: number | null;
  stripe_payment_intent_id: string | null;
  stripe_setup_intent_id: string | null;
};

type CampaignRow = {
  id: string;
  lot_id: string;
  status: string;
};

type LotRow = {
  id: string;
  title: string | null;
  committed_quantity_kg: number | null;
};

type Summary = {
  campaignsAffected: number;
  campaignsFinalized: number;
  campaignsFinalizeFailed: number;
  refundsIssued: number;
  refundsFailed: number;
  totalRefundCents: number;
  commitsCancelledNoCharge: number;
  oldModelCommits: number;
  newModelCommits: number;
  unknownStateCommits: number;
};

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  const mode = parseArgs(process.argv);
  loadDotenv();

  console.log("");
  console.log("=========================================================");
  console.log("  force-close-inflight-campaigns");
  console.log(`  mode: ${mode === "apply" ? "APPLY (writes will happen)" : "DRY-RUN (no writes)"}`);
  console.log("=========================================================");
  console.log("");

  if (mode === "dry-run") {
    info(
      "Dry-run mode. No Stripe refunds, no Supabase writes, no campaign finalize. " +
        "Re-run with --apply once the plan looks right."
    );
  } else {
    warn(
      "APPLY mode. This will issue real Stripe refunds and finalize campaigns. " +
        "Make sure you've reviewed the dry-run output first."
    );
  }
  console.log("");

  const admin = createAdminClient();

  const { data: campaigns, error: campaignsError } = await admin
    .from("campaigns")
    .select("id, lot_id, status")
    .eq("status", "active");

  if (campaignsError) {
    console.error(`[ERROR] Failed to load campaigns: ${campaignsError.message}`);
    process.exit(1);
  }

  const activeCampaigns = (campaigns || []) as CampaignRow[];

  if (activeCampaigns.length === 0) {
    info("No campaigns with status='active'. Nothing to do.");
    console.log("");
    info("Done.");
    return;
  }

  info(`Found ${activeCampaigns.length} active campaign(s) to force-close.`);
  console.log("");

  const summary: Summary = {
    campaignsAffected: 0,
    campaignsFinalized: 0,
    campaignsFinalizeFailed: 0,
    refundsIssued: 0,
    refundsFailed: 0,
    totalRefundCents: 0,
    commitsCancelledNoCharge: 0,
    oldModelCommits: 0,
    newModelCommits: 0,
    unknownStateCommits: 0,
  };

  for (const campaign of activeCampaigns) {
    summary.campaignsAffected += 1;

    const { data: lot, error: lotErr } = await admin
      .from("lots")
      .select("id, title, committed_quantity_kg")
      .eq("id", campaign.lot_id)
      .single<LotRow>();

    if (lotErr) {
      warn(
        `Campaign ${campaign.id}: failed to load lot ${campaign.lot_id} — ${lotErr.message}. Skipping.`
      );
      continue;
    }

    const { data: commits, error: commitsErr } = await admin
      .from("commitments")
      .select(
        "id, buyer_id, quantity_kg, status, payment_status, charge_amount_cents, total_price, stripe_payment_intent_id, stripe_setup_intent_id"
      )
      .eq("campaign_id", campaign.id);

    if (commitsErr) {
      warn(
        `Campaign ${campaign.id}: failed to load commitments — ${commitsErr.message}. Skipping.`
      );
      continue;
    }

    const commitments = (commits || []) as CommitmentRow[];

    console.log(
      `--- campaign ${campaign.id} | lot ${lot?.id ?? "?"} (${lot?.title ?? "untitled"}) ` +
        `| committed=${lot?.committed_quantity_kg ?? 0}kg | commits=${commitments.length} ---`
    );

    for (const commit of commitments) {
      const buyer = commit.buyer_id ?? "?";

      if (commit.stripe_payment_intent_id) {
        // OLD model — money was captured. Refund.
        summary.oldModelCommits += 1;

        const amountCents = Number(
          commit.charge_amount_cents ??
            (commit.total_price != null ? Math.round(Number(commit.total_price) * 100) : 0)
        );

        if (commit.status === "cancelled" || commit.payment_status === "cancelled") {
          info(
            `  commit ${commit.id}: already cancelled (payment_status=${commit.payment_status}). Skipping refund.`
          );
          continue;
        }

        planLine(
          mode,
          `Will refund: commit ${commit.id} ${formatUsd(amountCents)} (PI ${commit.stripe_payment_intent_id}) to buyer ${buyer}`
        );

        if (mode === "apply") {
          try {
            await createRefund({
              paymentIntentId: commit.stripe_payment_intent_id,
              commitmentId: commit.id,
              reason: "requested_by_customer",
              idempotencySuffix: "force-close-inflight",
            });
            summary.refundsIssued += 1;
            summary.totalRefundCents += amountCents;
            // Mark the commit cancelled so the finalize_campaign RPC's
            // cancel-non-cancelled pass doesn't try to do anything
            // surprising with a refunded row.
            const { error: updateErr } = await admin
              .from("commitments")
              .update({
                status: "cancelled",
                payment_status: "cancelled",
                payment_error: "Refunded by force-close-inflight-campaigns deploy script",
              })
              .eq("id", commit.id);
            if (updateErr) {
              warn(
                `  commit ${commit.id}: refunded in Stripe but commitment row update failed — ${updateErr.message}. Manual cleanup may be needed.`
              );
            }
          } catch (err) {
            summary.refundsFailed += 1;
            warn(
              `  commit ${commit.id}: REFUND FAILED — ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
      } else if (commit.stripe_setup_intent_id) {
        // NEW model — only card was saved. No charge to undo.
        summary.newModelCommits += 1;
        planLine(
          mode,
          `Will mark cancelled: commit ${commit.id} (setup_intent ${commit.stripe_setup_intent_id}, no charge to refund) buyer ${buyer}`
        );
        // The finalize_campaign 'cancelled' branch cancels non-cancelled commits,
        // but the 'failed' branch (which is what we use here) does NOT cancel commits.
        // So we mark them cancelled explicitly so the buyer-facing dashboards reflect
        // reality.
        if (mode === "apply") {
          if (commit.status === "cancelled") {
            // already done
          } else {
            const { error: updateErr } = await admin
              .from("commitments")
              .update({
                status: "cancelled",
                payment_status: "cancelled",
                payment_error: "Cancelled by force-close-inflight-campaigns deploy script (no charge taken)",
              })
              .eq("id", commit.id);
            if (updateErr) {
              warn(
                `  commit ${commit.id}: failed to mark cancelled — ${updateErr.message}.`
              );
            } else {
              summary.commitsCancelledNoCharge += 1;
            }
          }
        }
      } else {
        // Neither — orphan, never finished setup or capture.
        summary.unknownStateCommits += 1;
        planLine(
          mode,
          `Will mark cancelled: commit ${commit.id} (no PI or SI — orphan, never completed) buyer ${buyer}`
        );
        if (mode === "apply") {
          if (commit.status !== "cancelled") {
            const { error: updateErr } = await admin
              .from("commitments")
              .update({
                status: "cancelled",
                payment_status: "cancelled",
                payment_error: "Cancelled by force-close-inflight-campaigns deploy script (orphan, no Stripe state)",
              })
              .eq("id", commit.id);
            if (updateErr) {
              warn(
                `  commit ${commit.id}: failed to mark cancelled — ${updateErr.message}.`
              );
            } else {
              summary.commitsCancelledNoCharge += 1;
            }
          }
        }
      }
    }

    // Finalize the campaign as 'failed' regardless of commit composition. This
    // matches the spirit of "force close": every in-flight campaign halts,
    // money returns where it can, and lots recycle to awaiting_relist so
    // sellers can re-launch them under the new bag-aware model.
    planLine(mode, `Will finalize campaign ${campaign.id} as 'failed' (recycles lot ${campaign.lot_id})`);
    if (mode === "apply") {
      const result = await finalizeCampaign(admin, campaign.id, "failed");
      if (result.ok) {
        summary.campaignsFinalized += 1;
      } else {
        summary.campaignsFinalizeFailed += 1;
        warn(`Campaign ${campaign.id}: finalize_campaign RPC failed — ${result.error}`);
      }
    }

    console.log("");
  }

  // ---------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------
  console.log("=========================================================");
  console.log("  SUMMARY");
  console.log("=========================================================");
  console.log(`  Mode:                              ${mode}`);
  console.log(`  Campaigns scanned:                 ${summary.campaignsAffected}`);
  if (mode === "apply") {
    console.log(`  Campaigns finalized as failed:     ${summary.campaignsFinalized}`);
    if (summary.campaignsFinalizeFailed > 0) {
      console.log(`  Campaigns finalize FAILED:         ${summary.campaignsFinalizeFailed}  <-- inspect logs`);
    }
  }
  console.log(`  OLD-model commits (had PI):        ${summary.oldModelCommits}`);
  console.log(`  NEW-model commits (setup only):    ${summary.newModelCommits}`);
  console.log(`  Orphan commits (no Stripe state):  ${summary.unknownStateCommits}`);
  if (mode === "apply") {
    console.log(
      `  Refunds issued:                    ${summary.refundsIssued} (${formatUsd(summary.totalRefundCents)})`
    );
    if (summary.refundsFailed > 0) {
      console.log(`  Refunds FAILED:                    ${summary.refundsFailed}  <-- inspect logs`);
    }
    console.log(`  Commits cancelled (no charge):     ${summary.commitsCancelledNoCharge}`);
  } else {
    console.log(
      `  Refunds PLANNED:                   ${summary.oldModelCommits} commits (rerun with --apply to execute)`
    );
  }
  console.log("");

  if (summary.oldModelCommits > 0) {
    warn(
      "OLD-model commits were refunded from the platform's Stripe balance. " +
        "Any seller / hub transfers tied to those charges may still sit on " +
        "the recipients' Connect accounts. Reconcile manually against the " +
        "Stripe dashboard after this script runs."
    );
    console.log("");
  }

  info("Done.");
}

run().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});

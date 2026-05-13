# CrowdRoast Deploy Runbook

Operator notes for non-trivial deploys. Add a new section when a deploy needs
out-of-band steps beyond the usual `git push`.

---

## Stage 4: Bag-aware campaign close (charge-on-fill)

This deploy switches CrowdRoast from "charge buyers at commit" to
"charge buyers per filled bag at settlement". Any campaign that's still
`active` when the new code ships needs to be force-closed first, otherwise
its commits are stranded mid-model — some have captured PaymentIntents
(old model), some have only saved SetupIntents (new model), and the new
settlement code only knows how to handle the latter.

### One-shot: `scripts/force-close-inflight-campaigns.ts`

**What it does**

For every campaign with `status = 'active'`:

- For each commit with `stripe_payment_intent_id` populated → OLD model;
  issue a full Stripe refund.
- For each commit with `stripe_setup_intent_id` populated and
  `stripe_payment_intent_id` NULL → NEW model; no charge happened, mark
  the commit cancelled, move on.
- For orphan commits with neither populated → mark cancelled.
- Call `finalize_campaign(..., 'failed')` to flip the campaign to
  `failed` and recycle the lot back to `awaiting_relist`.

It does NOT:

- Send email notifications to buyers. Ops can decide whether the buyer
  needs to hear about a refund driven by a model cutover (vs a campaign
  actually failing on merits). Follow up out-of-band.
- Reverse seller / hub Connect transfers tied to already-captured
  charges. `createRefund` pulls from the platform's Stripe balance only.
  Any seller/hub money that was already wired needs MANUAL reconciliation
  against the Stripe dashboard after the script finishes — the script
  flags this in its final summary.

### Run order

The script talks directly to Stripe + Supabase (it does NOT call the
deployed Next.js route), so its ordering relative to the Vercel deploy is
loose. But prefer:

1. **Freeze new commits.** Put the site in a maintenance state or pause
   the relevant Vercel deployment so no new buyer can commit while the
   script is running. (Stage gate decision: if traffic is low, you can
   skip this and accept the small race window — any commits that land
   between the script start and the deploy finishing will be cleaned up
   on the next manual run.)
2. **Run the script in dry-run mode** against the prod Supabase. Eyeball
   the output: how many campaigns, how many old-model refunds, how much
   total $.
3. **Run the script with `--apply`.** Confirm the summary lines up with
   the dry-run plan.
4. **Deploy the Stage 4 code to Vercel.**
5. **Spot-check** that no `campaigns.status = 'active'` rows exist (they
   shouldn't — the script just finalized them all). If any reappear,
   they were created in the race window and need a second pass.
6. **Reconcile seller/hub transfers** in the Stripe dashboard for any
   refunded old-model commit. The platform-balance refund made the buyer
   whole; the seller/hub balances may still hold the now-untethered
   transfers. Decide per-row whether to leave them, reverse them in
   Stripe, or claw back on the next payout cycle.

### Invocation

```bash
# From the crowdroast/ project root, with prod env loaded (.env.prod-ish
# OR via direnv OR pass the env vars on the command line — service role
# key is required):

# 1) Always dry-run first
pnpm tsx scripts/force-close-inflight-campaigns.ts --dry-run

# 2) When the plan looks right
pnpm tsx scripts/force-close-inflight-campaigns.ts --apply
```

Env vars consumed:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY` (only needed for `--apply`)

### Manual smoke test before prod

Run against the local Supabase first with a seeded active campaign:

```bash
pnpm run db:seed
pnpm tsx scripts/force-close-inflight-campaigns.ts --dry-run
```

If the seeded campaign shows up with its commits and a sensible plan,
the script is wired correctly. Re-run with `--apply` against the same
local DB and verify the campaign flipped to `failed` and the lot is
`awaiting_relist`.

### Rollback

There is no automatic rollback for refunds — once Stripe accepts a
refund request, it's irreversible. If the wrong campaign was refunded,
re-list the lot and ask the affected buyers to re-commit under the new
model. (This is one of the reasons the dry-run-first convention is
non-negotiable.)

`finalize_campaign` is idempotent and locks the campaign row, so a
second run after a partial failure is safe.

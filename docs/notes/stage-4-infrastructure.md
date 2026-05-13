# Stage 4 Infrastructure Notes

> Read-only investigation for Task 4.0 of bag-aware-campaign-close.
> Resolves Open Questions #1 and #8 in the spec.
> Every claim cites a file + line range. No speculation.

---

## TL;DR

| Question | Verdict |
|---|---|
| 1. Settlement code state | **Extensible, NOT skeletal.** `lib/lots/finalize-campaign.ts` is a thin atomic-status wrapper around a Postgres RPC. **The real settlement logic is a single 1,214-line route** at `app/api/payments/settle-deadlines/route.ts` — fully implemented (per-commitment refund, transfer, fee absorption, referral hooks). `lib/settle-attribution.ts` referenced in the plan does not exist at that path; it's at `lib/referrals/settle-attribution.ts` and is **referral-only**, not money settlement. Plan path is wrong. |
| 2. Commit-time flow | **Charges immediately via Stripe Checkout in `mode: "payment"`.** Not save-card. Stage 4.3's refactor is real work — swap mode to `setup` and add an auth probe. `payment_status` is a small state machine with five values. |
| 3. Async/cron infra | **Vercel cron + a Bearer-secret-gated Next.js route.** No Inngest/Trigger.dev/queue. Each cron route is just a `GET`/`POST` handler in `app/api/...` with a `vercel.json` entry. Daily-only cadence is the constraint. Charge worker should follow this exact pattern — new `app/api/cron/process-bag-charges/route.ts` + add to `vercel.json`. |
| 4. Admin dashboard surface | **Exists and is sectioned.** All admin routes (`/dashboard/admin/*`) render one component, `components/admin/admin-console.tsx` (1,218 lines, six sections). Layout-level gate via `isAdminAccount`. Task 4.10 can drop in as a new section `failed-payments` — but **no audit table exists** (no `ops_actions`); 4.10 must create one. |

**Biggest scope risk:** Task 4.10's audit table is undocumented in the plan. The plan says "writes to an `ops_actions` audit table (or extends an existing one — flag if missing in 4.0)" — confirmed missing. A new migration is needed.

**Surprise:** The current commit flow **actually charges immediately** through Stripe Checkout `mode: "payment"`. Spec Open Question #2 implies an `setup_intent` flow may have existed before; the webhook handler does have a `mode === "setup"` branch (`app/api/stripe/webhook/route.ts:90-107`) but the live commit route never invokes it. So Stage 4.3 will both add new code AND can leverage the existing webhook setup-complete plumbing.

---

## Question 1: Current state of settlement code

### `lib/lots/finalize-campaign.ts` (50 lines, full implementation)

`lib/lots/finalize-campaign.ts:25-49` — a thin wrapper around the `finalize_campaign` Postgres RPC. Takes `(admin, campaignId, outcome)` where outcome is `'settled' | 'failed' | 'cancelled'`. Returns `{ ok: true } | { ok: false, error }`.

The atomic work lives in `supabase/migrations/20240101000024_finalize_campaign.sql:81-148`:
- Locks campaign row `FOR UPDATE` (`migration:103`).
- No-ops if `status != 'active'` — idempotent for retry (`migration:110-112`).
- For `'cancelled'`: bulk-cancels non-cancelled commitments (`migration:118-124`). For `'settled' | 'failed'`: leaves commitments alone — caller pre-handled Stripe.
- Updates `campaigns.status` + `settled_at` (`migration:127-130`).
- Recycles the lot: deletes `hub_lots`, sets `lots.status='awaiting_relist'`, zeros `committed_quantity_kg`, nulls `hubs.featured_lot_id` (`migration:135-146`).
- Wrapped in one PG transaction — partial failure rolls back.

**Verdict on this file**: extensible. Stage 4 can keep calling it as the terminal-state primitive. Bag-aware logic doesn't need to change `finalize_campaign` itself; the failure-mode branch (task 4.7) just needs to call it with `outcome = 'failed'` when `completed_bags < min_bags_to_succeed`. **No edits to the SQL function needed.**

### `lib/referrals/settle-attribution.ts` (77 lines, fully implemented)

Plan task 4.0 says "Read `lib/settle-attribution.ts`". **That path does not exist.** The actual file is `lib/referrals/settle-attribution.ts` (`settle-attribution.ts:18-77`).

It is **not** the money-settlement codepath. It flips a `referral_attributions` row from `'pending'` to `'earned'` and inserts a `+$10` `credit_ledger` row for the inviter. Idempotent via partial unique index. Called per-commitment from inside `app/api/payments/settle-deadlines/route.ts:1076` after a successful transfer.

**Verdict**: the plan's reference to "settle-attribution" as the settlement extension point is misleading. The plan should be read as "lib/lots/finalize-campaign.ts + the settle-deadlines route". Settle-attribution is a downstream side-effect, not the per-commitment Stripe path.

### `app/api/payments/settle-deadlines/route.ts` (1,214 lines — THE real settlement code)

This is the file Stage 4 actually changes. It is **fully implemented**, not stubbed. Skim of the flow:

- `app/api/payments/settle-deadlines/route.ts:263-1209` — `settleDeadlines(request)` handler.
- Auth: `authorizeCronRequest` via `CRON_SECRET` bearer (`route.ts:267`).
- Loads `platform_settings.platform_connect_account_id` with fallback to env (`route.ts:279-317`).
- Queries `campaigns WHERE deadline <= now AND status = 'active'` (`route.ts:339-343`).
- For each due campaign:
  - Cancels orphan commitments (no `stripe_payment_intent_id`) (`route.ts:359-380`).
  - Loads the lot (`route.ts:382-398`).
  - **If minimum not met**: refunds via `createRefund` on each `charge_succeeded` commitment, calls `finalizeCampaign(admin, campaign.id, 'failed')`, fires `sendLotFailedNotifications` + `voidAttributionsForCampaign` (`route.ts:402-552`).
  - **If minimum met**: resolves tier via `getFinalPricePerKg`, then per commitment computes `computeChargeAdjustment` (price-adjustment refund), `computeSplit`, `applyStripeFeeToPlatformShare`, `applyInviterCreditOnSettle`, then issues `createTransfer` to seller / hub / crowdroast (`route.ts:638-1125`).
  - Idempotency: lists existing refunds + transfers per charge and only issues missing deltas (`route.ts:812-832, 875-892`).
- All Stripe operations idempotent via `commitment_id`-based keys (`lib/stripe.ts:275, 297, 337`).

**Concurrency control**: `finalize_campaign` RPC uses `SELECT ... FOR UPDATE` + status check. Per-Stripe-action idempotency keys (`lib/stripe.ts:255-277, 279-299, 313-339`) prevent double-charges across cron retries. There is **no lock on `commitments`**; the route relies on Stripe's idempotency + the campaign-row lock at finalize.

### Tables read/written

- Read: `platform_settings`, `profiles`, `campaigns`, `lots`, `commitments`, `pricing_tiers`, `hubs`.
- Written: `commitments` (status/payment_status/payment_error/stripe_*), `campaigns` (status), `lots` (settlement_status/settlement_processed_at via finalize), `hub_lots` (delete via finalize), `credit_ledger`, `referral_attributions`.

### Stripe calls present today

- `createRefund` (full + partial price-adjustment + inviter-credit) — `lib/stripe.ts:313-339`.
- `createTransfer` (seller / hub / crowdroast) — `lib/stripe.ts:279-299`.
- `getChargeFeeCents` (balance-transaction read) — `lib/stripe.ts:244-253`.
- `createAndConfirmPaymentIntent` (exists at `lib/stripe.ts:255-277`, **idempotency key `commitment-charge-<id>`**) — **not used by today's commit or settlement flow**. This is the helper task 4.8's charge worker will call.
- `createPaymentCheckoutSession` (`lib/stripe.ts:201-225`) — used at commit time.
- `createSetupCheckoutSession` (`lib/stripe.ts:180-199`) — **defined but not called from `app/api/commitments/route.ts`** (verified via grep). Wired in the webhook for `mode: 'setup'` (`app/api/stripe/webhook/route.ts:90-107`) but no caller invokes setup-mode today.

### What invokes settlement

Single invoker: `vercel.json:4-7` cron entry `path: /api/payments/settle-deadlines, schedule: 0 0 * * *` (daily UTC midnight). Also has a manual local trigger via `scripts/cron-settle-deadlines.ts`. No webhook, no admin action, no other path.

### Final verdict — Question 1

**Extensible.** Stage 4 plugs into a fully-working settlement route. The plan's reference to "skeletal stubs" is wrong — `finalize-campaign.ts` is a thin RPC wrapper because the work is in SQL, and the real per-commitment Stripe logic is in the route file (1,214 lines, well-tested per `app/api/payments/settle-deadlines/__tests__/`).

Concrete extension strategy for Stage 4:
- Stage 4 settlement work (tasks 4.4–4.7) should **add a new "successful-min-met" branch** in `route.ts:638-1125` that creates `commitment_bag_charges` rows instead of (or alongside) the current price-adjustment-refund + transfer code.
- For a clean migration, the **fastest path is to gate the new bag-aware branch on `lot.bag_size_kg IS NOT NULL`** — the old branch stays alive for any legacy lots that escape task 4.14's force-close.

---

## Question 2: Current commit-time flow

Read: `app/api/commitments/route.ts:1-299` in full.

### Exact sequence of side effects (happy path)

1. Auth check (`route.ts:11-18`).
2. Validate body (`route.ts:20-28`).
3. Fetch lot (`route.ts:30-39`) — 404 if not found.
4. Reject if `lot.status != 'active'` (`route.ts:41-46`).
5. **Bag-size backfill gate** (task 1.9 already shipped) — reject if `lot.bag_size_kg IS NULL` (`route.ts:48-60`).
6. Look up active campaign for `(lot_id, hub_id)` (`route.ts:62-83`).
7. Reject if campaign deadline passed (`route.ts:86-91`).
8. Reject self-commit (`route.ts:93-98`).
9. Reject overcommit (`route.ts:100-106`).
10. Load pricing tiers, resolve `activeSellerPricePerKg` (`route.ts:108-127`).
11. Add platform fee → `activeBuyerPricePerKg` → `total_price` → `chargeAmountCents` (`route.ts:129-131`).
12. Load buyer profile (`route.ts:133-138`).
13. **Stripe customer**: if `stripe_customer_id` missing on profile, call `createStripeCustomer(email)` and persist (`route.ts:140-148`).
14. Reuse-or-insert commitment row: if there's an existing unpaid commitment for this `(lot_id, buyer_id)`, **update it in place**; else insert (`route.ts:150-189`). Stamps `payment_status: 'pending_setup'`.
15. **Bag-aware split computation** (task 2.1 already shipped) — load all campaign commits, run `assignKgToBags`, find this commit's split (`route.ts:197-239`). Pure read; logs warnings on failure but doesn't error out.
16. **Stripe Checkout in `mode: 'payment'`** — `createPaymentCheckoutSession` with `amountCents = chargeAmountCents` (`route.ts:249-262`, calls `lib/stripe.ts:201-225`). The customer pays at this URL. Money is taken immediately on session completion.
17. Persist `stripe_checkout_session_id` (`route.ts:264-267`).
18. Return `{ commitment, checkout_url, split? }` with status 201 (`route.ts:269-276`).

On Stripe failure: update commitment with `payment_status: 'charge_failed'` + error message (`route.ts:277-298`).

### Is money charged immediately?

**Yes.** `createPaymentCheckoutSession` (`lib/stripe.ts:201-225`) uses `mode: "payment"`. The buyer is redirected to Stripe's hosted checkout, completes payment, and the webhook receives `checkout.session.completed` with `session.mode === "payment"` and `session.payment_status === "paid"` — at which point `app/api/stripe/webhook/route.ts:40-89` stamps `payment_status: 'charge_succeeded'` and `charged_at`. This is **charge-on-commit**, not save-card-charge-later.

### `payment_status` value semantics

From walking the codebase:

- **`pending_setup`** — set on insert by `app/api/commitments/route.ts:171`. Initial state before Stripe interaction completes.
- **`setup_complete`** — set in webhook handlers `app/api/stripe/webhook/route.ts:94, 150` when `checkout.session.completed` (mode=setup) OR `setup_intent.succeeded` fires. **Currently unreachable from the live commit flow** because no caller invokes `createSetupCheckoutSession`. The plumbing exists but is dead code from the buyer side.
- **`charge_succeeded`** — set in webhook `app/api/stripe/webhook/route.ts:60, 123` when `checkout.session.completed` with `payment_status: 'paid'` OR `payment_intent.succeeded`.
- **`charge_failed`** — set in commit route on Stripe failure (`route.ts:281`), and in webhook on `payment_intent.payment_failed` / `charge.failed` / non-paid checkout completion (`webhook/route.ts:67, 191, 226`).
- **`cancelled`** — set on `checkout.session.expired`, `setup_intent.setup_failed`, or refund-due-to-min-not-met (`webhook/route.ts:169, 259`; `settle-deadlines/route.ts:485`).

### Save-card-charge-later anywhere today?

**No.** The `setup`-mode plumbing exists in the webhook and in `lib/stripe.ts:180-199`, but **no call site invokes `createSetupCheckoutSession`** (verified via grep — only the webhook references it as a destination state). Stage 4.3 is a real refactor: must implement the full save-card flow.

**Useful for Stage 4.3**: `setup_intent.succeeded` webhook handler at `app/api/stripe/webhook/route.ts:136-157` already stores `stripe_setup_intent_id`, `stripe_payment_method_id`, `stripe_customer_id` and stamps `payment_status: 'setup_complete'`. Stage 4.3 can lean on this existing plumbing rather than building from scratch.

### Final verdict — Question 2

Current flow is **charge-on-commit via Stripe Checkout in payment mode**. Stage 4.3 must:
1. Replace `createPaymentCheckoutSession` call with `createSetupCheckoutSession` (already exists at `lib/stripe.ts:180-199`).
2. Add a new `probeCardAuth` helper (task 4.2 — does not exist yet in `lib/stripe.ts`).
3. Drop `chargeAmountCents` from the commit-time persist (no longer relevant pre-settlement) — but keep computing it for the auth probe's reference amount.
4. Lean on the existing `setup_intent.succeeded` webhook path to stamp `payment_status: 'setup_complete'`.

---

## Question 3: Async / cron / queue infrastructure

### What exists

- **Vercel Cron** is the only background mechanism. Config in `vercel.json:3-20`:
  - `/api/payments/settle-deadlines` — daily `0 0 * * *` (00:00 UTC).
  - `/api/cron/lot-expiry` — daily `0 1 * * *` (01:00 UTC).
  - `/api/cron/seller-coffees-digest` — daily `0 17 * * *`.
  - `/api/cron/hub-campaigns-digest` — every 3 days `0 16 */3 * *`.
- **No** Inngest, Trigger.dev, BullMQ, Agenda, or Supabase Edge Functions (`supabase/functions/` directory does not exist — verified).
- **No** webhook-driven background work beyond Stripe webhook side effects (`app/api/stripe/webhook/route.ts`).

### Cron route pattern

Every cron route is a Next.js App Router route handler (`GET` or `POST`) gated by `authorizeCronRequest` at `lib/auth/cron-route.ts:26-44`. The handler reads `CRON_SECRET` from env, accepts it as either `Authorization: Bearer <secret>` or `x-cron-secret: <secret>`, and uses `crypto.timingSafeEqual` to compare. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically.

Reference implementation: `app/api/cron/lot-expiry/route.ts:15-85` is a clean 71-line template — guard, query for due rows, loop, return `NextResponse.json({...}, { status: failures > 0 ? 207 : 200 })`.

### Constraints

- **Schedule cadence**: All current crons are at least daily. Vercel hobby/pro plans support `* * * * *` minute-level crons; Stage 4.8's retry ladder (0 / 12 / 48 hour intervals) easily fits in even hourly cadence. **Recommend hourly cron for `process-bag-charges`** — gives 12h / 48h retries adequate resolution without overcommitting compute.
- **Timeout**: Default Vercel function timeout is 60s for Hobby, 300s for Pro. `settle-deadlines/route.ts` is unbounded with a `for ... of` over campaigns — implicitly assumes <300s of Stripe API calls per cron tick. **Charge worker for many bags may exceed this**. Suggest paginating: process a fixed batch (e.g. 50 rows) per tick.
- **Retry semantics**: Vercel Cron does not auto-retry on failure (per Vercel docs). The codebase already encodes idempotency in every Stripe call via deterministic keys (`lib/stripe.ts:275, 297, 337`) — same pattern is required for the charge worker.
- **Concurrency**: There is no distributed lock. Two simultaneous cron invocations would race. Today's `finalize_campaign` RPC uses row-level lock + status guard (`migration:103, 110-112`) for safety. **The charge worker should use the same pattern**: `UPDATE commitment_bag_charges SET payment_status = 'charging' WHERE id = ... AND payment_status IN ('awaiting_charge', 'retry_scheduled') RETURNING *` — only the winning UPDATE gets the row.
- **Auth**: Same `authorizeCronRequest` + `CRON_SECRET` pattern. No additional setup needed.

### Final verdict — Question 3

**Clear winner: a new Next.js App Router cron route at `app/api/cron/process-bag-charges/route.ts`**, gated by `authorizeCronRequest`, registered in `vercel.json` with **hourly** schedule (`0 * * * *`). Follow the `lot-expiry/route.ts` template exactly.

For task 4.8 (`lib/charge-worker.ts`): make it a pure function that takes `(admin, batchSize)` and processes that many `commitment_bag_charges` rows. The route handler is a thin auth-then-call wrapper. Tests call the worker directly with a mocked admin client.

**Watch out for**: settle-deadlines runs at 00:00 UTC and creates the `commitment_bag_charges` rows. The charge worker should run **on a different minute** to avoid stomping the same campaigns mid-creation. Recommend `15 * * * *` (every hour at :15). Or trigger the worker once inline at the end of the settle-deadlines route to pick up the first attempts immediately.

---

## Question 4: Admin / ops dashboard surface

### What exists

- **Layout-level admin gate** at `app/dashboard/admin/layout.tsx:6-29`. Loads the user, fetches `profiles.role`, calls `isAdminAccount({ email, role })` from `lib/auth/admin.ts:28`, redirects to `/dashboard` if not admin. Both env-listed admin emails AND `profiles.role = 'admin'` satisfy the check.
- **Admin API route gate** at `lib/auth/admin-route.ts:24` for server-side admin actions.
- **Single shared admin shell**: every page under `app/dashboard/admin/*` renders `<AdminConsole initialSection="..."/>` from `components/admin/admin-console.tsx` (1,218 lines).
- Section enum: `type AdminSection = "roles" | "hubs" | "invites" | "requests" | "claims" | "refunds"` (`admin-console.tsx:31`).
- Pages: `app/dashboard/admin/{roles,hubs,invites,requests,claims,refunds}/page.tsx` — each is a 3–6 line file that just passes `initialSection`. Index (`app/dashboard/admin/page.tsx:4`) redirects to `/dashboard/admin/roles`.

### Plan fit for task 4.10

Drop-in. Two-step add:

1. New route file `app/dashboard/admin/failed-payments/page.tsx` (3-line wrapper, copy `refunds/page.tsx`).
2. Extend `AdminSection` type in `components/admin/admin-console.tsx:31` and add a new section render branch.

The auth gate is already inherited from the layout. No new auth scaffolding.

### Audit-table blocker

The plan (`plan.md:474`) says: "Each action writes to an `ops_actions` audit table (or extends an existing one — flag if missing in 4.0)."

**Confirmed missing.** No `ops_actions` table in `supabase/migrations/` (verified via grep; no matches in any `.sql` file). The only audit-adjacent surfaces are:
- `credit_ledger` — financial ledger only, not generic.
- `commitments.payment_error` — single text field, not auditable history.

**Stage 4 must add an audit table.** Suggest a new migration alongside the schema migration in task 4.1: `ops_actions(id, actor_user_id, action_type, target_table, target_id, payload jsonb, created_at)` with RLS allowing admin reads/writes.

This **expands Stage 4 scope by ~1 task**: a new migration + a tiny insert helper in `lib/admin/ops-actions.ts`. Not catastrophic but should be added to the plan.

### Final verdict — Question 4

**Pattern exists, drop-in trivial.** New section in `AdminConsole` + new wrapper page. **One real blocker**: `ops_actions` audit table does not exist. Add a sub-task to 4.10 (or a new 4.10.0) to create it.

---

## Scope risks & surprises for Stage 4

### Biggest scope risk

**Plan task 4.10's audit table assumption is wrong.** There is no `ops_actions` table and nothing close to it. A new migration + RLS + insert helper is required. Adds ~half a day. Recommend splitting task 4.10 into:
- 4.10a: migration for `ops_actions` table.
- 4.10b: ops dashboard section in `AdminConsole` (the page itself).

### Other notable risks

- **Old-model bridge in task 4.14**: today's commits **already have `stripe_payment_intent_id` populated for captured charges** (not setup intents). Task 4.14's "detect old-model commits" logic must distinguish on `payment_status = 'charge_succeeded'` (old, charged) vs `'setup_complete'` (new, save-card-only). The schema already supports this via the existing `payment_status` enum. Plan covers this correctly at `plan.md:519`.
- **`settle-deadlines/route.ts` is 1,214 lines and shared.** Stage 4 settlement changes will likely add another 300+ lines. **Strongly consider extracting a `lib/lots/settle-bag-aware.ts` module** during 4.5–4.7 to keep the route file maintainable. Not in the plan but worth flagging at the approve-gate.
- **No cron retry on failure** (Vercel Cron is fire-and-forget). The `payment_status = 'charging'` transition in 4.8 must be wrapped so that a crashed worker re-runs cleanly. Recommend: store `next_attempt_at = now() + interval '5 minutes'` BEFORE flipping to `'charging'`, so a crashed worker eventually re-picks-up the row on the next tick.
- **Daily cadence for settle-deadlines may not fit bag-aware** — if Stage 4.5 creates many `commitment_bag_charges` rows and the worker runs hourly, a single failed retry could push final settlement out 12+ hours. AC13's "72 hours since first attempt" needs to be measured from `commitment_bag_charges.created_at`, not from the first cron tick that picked it up, to be accurate.

### What surprised me

1. **The setup-intent flow already exists in the webhook** (`app/api/stripe/webhook/route.ts:90-107, 136-157`) but is dead code from the buyer's perspective. Stage 4.3 will resurrect it. The spec's Open Question #2 mentioned `setup_intent` as a future thing — it's actually 50% built already.
2. **`lib/settle-attribution.ts` does not exist at that path.** The plan task 4.0 referenced the wrong file. The settlement code is in the route file, not a lib module. This is a significant orientation gotcha for the next agent.
3. **The current settlement code already handles partial refunds via `computeChargeAdjustment` + `createRefund` with `kind: 'price_adjustment'`** (`settle-deadlines/route.ts:801-846`). This is the legacy "settle on a tier-priced final amount, refund the difference" logic that the bag-aware model deliberately replaces. The new branch can simply skip this code path when `bag_size_kg IS NOT NULL`.

---

## Files cited (absolute paths for the next agent)

- `/Users/zakdebrine/code/cos-workspace/mernin-os/crowdroast/lib/lots/finalize-campaign.ts` — settlement primitive.
- `/Users/zakdebrine/code/cos-workspace/mernin-os/crowdroast/lib/referrals/settle-attribution.ts` — referral side-effect (NOT money settlement).
- `/Users/zakdebrine/code/cos-workspace/mernin-os/crowdroast/app/api/payments/settle-deadlines/route.ts` — actual settlement logic (1,214 lines).
- `/Users/zakdebrine/code/cos-workspace/mernin-os/crowdroast/app/api/commitments/route.ts` — current commit flow.
- `/Users/zakdebrine/code/cos-workspace/mernin-os/crowdroast/app/api/stripe/webhook/route.ts` — Stripe webhook handler (has the dead-code setup-mode path).
- `/Users/zakdebrine/code/cos-workspace/mernin-os/crowdroast/lib/stripe.ts` — Stripe API client (incl. unused `createSetupCheckoutSession`, `createAndConfirmPaymentIntent`).
- `/Users/zakdebrine/code/cos-workspace/mernin-os/crowdroast/lib/auth/cron-route.ts` — cron auth helper.
- `/Users/zakdebrine/code/cos-workspace/mernin-os/crowdroast/app/api/cron/lot-expiry/route.ts` — clean cron route template.
- `/Users/zakdebrine/code/cos-workspace/mernin-os/crowdroast/vercel.json` — cron schedule config.
- `/Users/zakdebrine/code/cos-workspace/mernin-os/crowdroast/app/dashboard/admin/layout.tsx` — admin gate.
- `/Users/zakdebrine/code/cos-workspace/mernin-os/crowdroast/components/admin/admin-console.tsx` — sectioned admin shell.
- `/Users/zakdebrine/code/cos-workspace/mernin-os/crowdroast/lib/auth/admin.ts` + `/Users/zakdebrine/code/cos-workspace/mernin-os/crowdroast/lib/auth/admin-route.ts` — admin auth helpers.
- `/Users/zakdebrine/code/cos-workspace/mernin-os/crowdroast/supabase/migrations/20240101000024_finalize_campaign.sql` — the atomic RPC + trigger.

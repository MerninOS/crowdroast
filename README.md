# CrowdRoast

Specialty coffee group buying — sellers list lots, hubs aggregate buyer commitments, settled campaigns trigger Stripe Connect transfers and shipments.

## Stack at a glance

- **Next.js 16** (App Router) with React 19 and Turbopack
- **Supabase** for Postgres + Auth + Storage (managed via the Supabase CLI; local stack runs in Docker)
- **Stripe Connect** for marketplace payments (platform → connected sellers, with the platform / hub / seller revenue split handled at settlement)
- **Resend** for transactional email
- **Vercel Cron** for scheduled jobs (`/api/payments/settle-deadlines` and `/api/cron/lot-expiry`)
- **Vitest** for unit tests, **Tailwind + shadcn/ui** for the design system

---

## Getting started

A first-day walkthrough. If you already have CrowdRoast running, skip to **[Common dev tasks](#common-dev-tasks)**.

### 1. Prerequisites

| Tool | Install (macOS) | Verify |
|---|---|---|
| Node ≥ 20 | `brew install node` | `node --version` |
| Supabase CLI ≥ 2.90 | `brew install supabase/tap/supabase` | `supabase --version` |
| Docker (any flavor) — recommended: OrbStack | `brew install --cask orbstack` | `docker info` shows a daemon |
| Stripe CLI (optional, for webhook testing) | `brew install stripe/stripe-cli/stripe` | `stripe --version` |
| GitHub CLI (optional, for issues / PRs) | `brew install gh` | `gh auth status` |

OrbStack is the recommended Docker option on Mac — faster boot, lower memory than Docker Desktop, drop-in compatible.

### 2. Get a Stripe sandbox account

CrowdRoast won't run end-to-end without a Stripe sandbox. If you already have one for the team, skip to step 3.

1. Sign up / sign in at [dashboard.stripe.com](https://dashboard.stripe.com).
2. Make sure you're in **Test mode** (toggle top-right of the dashboard).
3. **Enable Connect in test mode**: Connect → Get started → choose Express. (Already done if your dashboard has a Connect overview page.)
4. Grab three values you'll paste into `.env.local` in the next step:
   - `STRIPE_SECRET_KEY` — Developers → API keys → "Secret key" (starts with `sk_test_`)
   - `STRIPE_WEBHOOK_SECRET` — Developers → Webhooks → create an endpoint (see [Stripe webhook setup](#stripe-webhook-setup) below for the exact event list); the secret is shown once on creation (`whsec_…`)
   - `CROWDROAST_STRIPE_CONNECT_ACCOUNT_ID` — Connect → Accounts → your platform's account ID at the top (`acct_…`). This is the parent account the platform uses; connected seller accounts are created at runtime.

### 3. Clone, install, configure

```bash
git clone git@github.com:MerninOS/crowdroast.git
cd crowdroast
npm install
cp .env.local.example .env.local
```

Edit `.env.local` and fill in:

```sh
# Local Supabase keys — run `supabase status` after `supabase start`
# to see them; same shared defaults on every install.
NEXT_PUBLIC_SUPABASE_ANON_KEY=<paste from supabase status — Publishable key>
SUPABASE_SERVICE_ROLE_KEY=<paste from supabase status — Secret key>

# Stripe sandbox (from step 2 above)
STRIPE_SECRET_KEY=sk_test_…
STRIPE_WEBHOOK_SECRET=whsec_…
CROWDROAST_STRIPE_CONNECT_ACCOUNT_ID=acct_…

# Cron auth — any string is fine, must match between wrapper + route
CRON_SECRET=local-dev-cron-secret

# Admin emails — your email so admin pages work
ADMIN_EMAILS=you@example.com
ADMIN_EMAIL=you@example.com
```

Leave `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` as is.

### 4. Run `dev:up`

```bash
npm run dev:up
```

That single command:

1. Boots local Supabase via Docker (`supabase start`)
2. Resets the local DB and applies every migration from `supabase/migrations/`
3. Seeds the canonical cast (1 hub, 1 seller w/ Stripe Connect sandbox, 3 buyers, 1 lot, 1 active campaign + paid commitment, plus 1 expired-only lot for the lot-expiry cron)
4. Starts `next dev` on `http://localhost:3000`

First run takes a few minutes (Docker pulls Supabase images + creates a Stripe Connect sandbox account). Subsequent runs are seconds.

### 5. Verify everything works

You should see:

- ✅ `http://localhost:3000` returns 200
- ✅ Boot log shows `[stripe] mode: TEST (sandbox) ✓` (green) — if you see a red `LIVE` banner, swap your Stripe key
- ✅ Supabase Studio at `http://127.0.0.1:54323` shows the seeded rows (profiles, lots, campaigns, etc.)
- ✅ One Stripe Connect account appears in your sandbox dashboard, tagged with metadata `crowdroast_seed=true`

If any of these are off, see **[Troubleshooting](#troubleshooting)**.

---

## Test users (seeded credentials)

After `dev:up`, sign in to the app with any of these to poke around:

| Role | Email | Password |
|---|---|---|
| Hub owner | `hub-owner@crowdroast.local` | `test-password-123` |
| Seller | `seller@crowdroast.local` | `test-password-123` |
| Buyer | `buyer-1@crowdroast.local` | `test-password-123` |
| Buyer | `buyer-2@crowdroast.local` | `test-password-123` |
| Buyer | `buyer-3@crowdroast.local` | `test-password-123` |

All passwords are the same intentionally — these accounts only exist on your local Supabase.

---

## Common dev tasks

### Running tests

```bash
npm test               # full Vitest suite, single run
npm run test:watch     # interactive watch mode
npx vitest path/to/specific.test.ts   # one file
```

### Inspecting the local DB

Supabase Studio runs at **`http://127.0.0.1:54323`**. Browse tables, run SQL, watch realtime updates. Auth users are visible under Authentication.

For raw psql:

```bash
docker exec -it $(docker ps --filter name=supabase_db_crowdroast --format '{{.Names}}') psql -U postgres
```

Connection string for tools like TablePlus / DataGrip:

```
postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

### Triggering cron jobs locally

Both Vercel cron jobs (`settle-deadlines` daily at 00:00 UTC, `lot-expiry` daily at 01:00 UTC) can be exercised on demand without waiting for the schedule:

```bash
# In a separate terminal (dev server must be running):

npm run cron:settle-deadlines
# Hits the route with Authorization: Bearer $CRON_SECRET, then asserts
# every campaign transitioned out of status='active'.

npm run cron:lot-expiry
# Same pattern. Asserts the seeded "Expired Test Lot" was marked
# status='expired' by the route.
```

If either wrapper exits with `401 Unauthorized`, your `CRON_SECRET` doesn't match between `.env.local` and the route's runtime env. Easiest fix: restart the dev server after editing `.env.local`.

### Re-seeding without a full reset

```bash
npm run db:seed:refresh
```

Truncates seed-owned rows, deletes Stripe Connect accounts tagged with `metadata.crowdroast_seed=true`, then re-creates the canonical cast. Faster than a full `dev:up` if you just want clean seed data.

### Boot guard rails

Whenever `next dev` starts, an instrumentation hook (`instrumentation.ts` →
`lib/env-validate.ts`) runs **on the developer's laptop only** (gated on
`!process.env.VERCEL` so prod boots are unaffected). It enforces:

- `NEXT_PUBLIC_SUPABASE_URL` must point at `localhost`, `127.0.0.1`, or `0.0.0.0`. Otherwise boot exits with `"Refusing to start dev"`. Prevents the "I forgot I was pointed at prod" footgun.
- `STRIPE_SECRET_KEY` must match `^sk_(test|live)_`. Live keys are allowed for prod-data debugging but trigger a loud red banner so you can never miss it.

If you boot `next dev` and the process exits immediately, scroll up for the
`[dev-env]` line — it tells you exactly which check failed.

---

## Stripe webhook setup

CrowdRoast's webhook handler at `/api/stripe/webhook` listens for seven events. You need each one configured against your sandbox account.

### Local development (Stripe CLI)

```bash
# Each session, forward sandbox events to your local dev server:
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

The CLI prints a `whsec_…` signing secret on first run. Paste it into `.env.local` as `STRIPE_WEBHOOK_SECRET` (or, better, create a stable endpoint in the Stripe Dashboard so you don't have to copy-paste a fresh secret every session — see below).

### Cloud sandbox / preview deployments (Stripe Dashboard)

Configure a webhook endpoint in your **sandbox** Stripe Dashboard:

- **Endpoint URL**: `https://<your-sandbox-domain>/api/stripe/webhook`
- **Description**: `CrowdRoast — Sandbox` (or per-developer: `CrowdRoast — Local (your-name)`)
- **Events to subscribe to** — every one of these is required:

  ```
  checkout.session.completed
  checkout.session.expired
  payment_intent.succeeded
  payment_intent.payment_failed
  charge.failed
  setup_intent.succeeded
  setup_intent.setup_failed
  ```

  The four events `checkout.session.expired`, `payment_intent.payment_failed`, `charge.failed`, and `setup_intent.setup_failed` are required for orphan-cart and charge-failure cancellation paths. Without them, abandoned/failed commitments won't get cancelled in real time and will pile up at campaign deadline — recreating the "Min Not Met" bug.

- **Signing secret**: the dashboard shows a fresh `whsec_…` when you create the endpoint. Set it as `STRIPE_WEBHOOK_SECRET` in `.env.local` (and on Vercel preview/prod if you're configuring those endpoints).

### Verifying the webhook

After setup, fire a fake `checkout.session.expired` event:

```bash
stripe trigger checkout.session.expired
```

The route should:
1. Receive the event and pass signature verification.
2. Update the matching commitment row to `status='cancelled'`, `payment_status='cancelled'`.
3. The DB trigger should drop `lots.committed_quantity_kg` by that commitment's `quantity_kg`.

If signature verification fails (returns 400 with `"Stripe signature verification failed"`), the most common cause is a stale or mismatched `STRIPE_WEBHOOK_SECRET` in `.env.local`.

---

## Schema migrations

### Adding a new migration

```bash
# Create a new migration file with an auto-generated UTC timestamp
supabase migration new add_some_feature

# Edit the new file under supabase/migrations/
# Apply it locally to test:
supabase db reset    # applies all migrations from scratch
# OR (preserves data):
supabase migration up
```

### Pushing migrations to prod

```bash
# 1. (One-time setup, per developer) link to the prod project:
supabase login
supabase link --project-ref <prod-project-ref>

# 2. After testing your migration locally:
npm run db:migrate:prod
```

The wrapper runs a pre-flight first: every file in `supabase/migrations/` must already be applied to your local DB. If you have a migration file that hasn't been tested locally, it aborts before touching prod.

After the pre-flight passes, `supabase db push --linked` shows you the diff and prompts before applying.

### CI guard

`npm run migrations:check` queries the prod ledger and fails non-zero if any migration file in this branch is not yet applied to prod. Wire this into a pre-push git hook (or future CI workflow) to block PR merges that would deploy a migration without first running `db:migrate:prod`.

(CI integration with this guard is parked at the future-initiatives doc; the script itself ships ready to invoke.)

---

## One-time prod ledger bootstrap runbook

> **This is run ONCE, by a single designated person, after the first PR introducing the Supabase CLI migration layout merges to `main`. Future contributors do NOT run this.**

CrowdRoast's 21 baseline migrations were applied to prod manually before the Supabase CLI was adopted. As a result, prod's `supabase_migrations.schema_migrations` table is empty even though the schema is fully applied. Without bootstrapping the ledger, `db:migrate:prod` would try to re-run all 21 migrations against an already-populated schema and fail with "table already exists" errors.

The bootstrap script teaches prod's ledger about the existing files without running their SQL.

```bash
# 1. From a clean checkout of `main`, link to prod:
supabase login
supabase link --project-ref <prod-project-ref>

# 2. Sanity check — see what would be marked:
npm run db:bootstrap-prod-ledger -- --dry-run

# 3. Run for real:
npm run db:bootstrap-prod-ledger
# Type BOOTSTRAP at the prompt.

# 4. Verify the ledger now contains all 21 baseline migrations:
supabase migration list --linked
# Every entry should show as Applied.
```

`supabase migration repair --status applied` is idempotent — re-marking an already-marked file is a no-op — so the script is safe to re-run if it dies partway.

After this is done, future `npm run db:migrate:prod` invocations will diff against this populated baseline and only apply genuinely-new migrations.

---

## Troubleshooting

### `next dev` exits immediately with `Refusing to start dev`

The boot validator caught a non-local `NEXT_PUBLIC_SUPABASE_URL`. Edit `.env.local` and set it to `http://127.0.0.1:54321`. (This is the validator doing its job — preventing accidental writes to prod.)

### `next dev` says "Port 3000 is in use" or "Unable to acquire lock at .next/dev/lock"

Another `next dev` process is already running, possibly orphaned from a previous session.

```bash
lsof -i :3000           # find the PID
kill <PID>              # terminate it
# Or, if the lock file is stale but the process is gone:
rm .next/dev/lock && npm run dev
```

### `dev:up` fails at `supabase start` with a Docker error

OrbStack (or Docker Desktop) isn't running. Open it (`open -a OrbStack`), wait for the daemon to come up, then:

```bash
docker info     # confirm daemon is up
npm run dev:up  # try again
```

### `db:seed` fails with `Refusing to seed against non-local Supabase`

Your `NEXT_PUBLIC_SUPABASE_URL` isn't local. Same fix as the boot validator: set it to `http://127.0.0.1:54321` in `.env.local`.

### `db:seed` fails with `Refusing to seed with non-sandbox Stripe key`

Your `STRIPE_SECRET_KEY` is `sk_live_…` instead of `sk_test_…`. Swap to a sandbox key (Stripe Dashboard → Test mode → Developers → API keys).

### Seed fails part-way

Run `npm run db:seed:refresh` — it cleans up any tagged Stripe Connect accounts and cascade-deletes the partial DB state via the seed auth users, then re-seeds from scratch.

### `cron:*` wrapper exits with `401 Unauthorized`

`CRON_SECRET` doesn't match between `.env.local` (read by the wrapper) and the route's runtime env. Both should be reading the same `.env.local`, so this usually means the dev server has stale env. Restart `next dev`.

### Migration file refuses to apply on `supabase db reset`

If a migration assumes prod state that doesn't exist locally (e.g., a hand-inserted row), it'll fail. Fix the migration to be idempotent (`if not exists`, `on conflict`, etc.) or add a small reconciliation patch before it.

### GitHub rejects a push with "secret detected" on local Supabase keys

The local Supabase CLI defaults (`sb_publishable_…` / `sb_secret_…`) are public shared values, but GitHub's secret scanner flags them anyway. Don't paste them into committed files. The shipped `.env.local.example` deliberately leaves them blank with a pointer to `supabase status`.

---

## Project layout

```
app/                        # Next.js 16 App Router pages and API routes
components/                 # React components (shadcn/ui base + product UI)
lib/                        # Server-side helpers (auth, db client, stripe, payments)
supabase/migrations/        # Schema migrations managed by Supabase CLI
scripts/                    # Dev tooling (seed, cron triggers, migrate-prod, etc.)
scripts/seed-assets/        # Sample lot images for the seed
.env.local.example          # Annotated env var template
instrumentation.ts          # Next.js boot hook — runs env-validate on dev only
```

## Out-of-scope (parked work)

- Per-failure-mode scenario scripts (orphan commitment, missing seller Connect, charge-failed, partial-refund, min-not-met) — follow-up to current dev-environment work.
- CI integration for migration safety check + scenario runs — parked at `~/Documents/crowdroast/future-initiatives/ci-integration.md`.

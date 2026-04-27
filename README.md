# CrowdRoast

Specialty coffee group buying — sellers list lots, hubs aggregate buyer commitments, settled campaigns trigger Stripe Connect transfers and shipments.

---

## Local development

### Prerequisites

| Tool | Install | Verify |
|---|---|---|
| Node | `brew install node` | `node --version` (≥ 20) |
| Supabase CLI ≥ 2.90 | `brew install supabase/tap/supabase` | `supabase --version` |
| Docker (any flavor) — recommended: OrbStack on Mac | `brew install --cask orbstack` | `docker info` shows a daemon |

### One-time setup

```bash
# 1. Install dependencies
npm install

# 2. Copy the env template and fill in your Stripe sandbox keys.
cp .env.local.example .env.local
# Edit .env.local — fill in:
#   STRIPE_SECRET_KEY            (sk_test_… from your Stripe sandbox)
#   STRIPE_WEBHOOK_SECRET        (whsec_… from your sandbox webhook endpoint)
#   CROWDROAST_STRIPE_CONNECT_ACCOUNT_ID  (acct_… from sandbox Connect overview)
#   CRON_SECRET                  (any string — must match between cron wrappers and route)
#   ADMIN_EMAILS / ADMIN_EMAIL   (your email so admin pages work)
#
# Leave the local Supabase keys at their defaults — they are public,
# shared values used by every `supabase start` install.
```

### Bring it all up

```bash
npm run dev:up
```

That single command:
1. Boots local Supabase via Docker (`supabase start`)
2. Resets the local DB and applies every migration from `supabase/migrations/`
3. Seeds the canonical cast (1 hub, 1 seller w/ Stripe Connect sandbox, 3 buyers, 1 lot, 1 active campaign + paid commitment, plus 1 expired-only lot for the lot-expiry cron)
4. Starts `next dev` on `http://localhost:3000`

### Boot guard rails

Whenever `next dev` starts, an instrumentation hook (`instrumentation.ts` →
`lib/env-validate.ts`) runs **on the developer's laptop only** (gated on
`!process.env.VERCEL` so prod boots are unaffected). It enforces:

- `NEXT_PUBLIC_SUPABASE_URL` must point at `localhost`, `127.0.0.1`, or `0.0.0.0`. Otherwise boot exits with `"Refusing to start dev"`. Prevents the "I forgot I was pointed at prod" footgun.
- `STRIPE_SECRET_KEY` must match `^sk_(test|live)_`. Live keys are allowed for prod-data debugging but trigger a loud red banner so you can never miss it.

If you boot `next dev` and the process exits immediately, scroll up for the
`[dev-env]` line — it tells you exactly which check failed.

### Re-seeding without a full reset

```bash
npm run db:seed:refresh
```

Truncates seed-owned rows, deletes Stripe Connect accounts tagged with
`metadata.crowdroast_seed=true`, then re-creates the canonical cast.
Faster than a full `dev:up` if you just want clean seed data.

---

## Stripe sandbox webhook setup

CrowdRoast's Stripe webhook handler at `/api/stripe/webhook` listens for
seven events. You need each one configured against your sandbox account.

### Local development (Stripe CLI)

```bash
# Install the CLI once
brew install stripe/stripe-cli/stripe

# Each session, forward sandbox events to your local dev server:
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

The CLI prints a `whsec_…` signing secret on first run. Paste it into
`.env.local` as `STRIPE_WEBHOOK_SECRET` (or, better, create a stable
endpoint in the Stripe Dashboard so you don't have to copy-paste a fresh
secret every session — see below).

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

  The four events `checkout.session.expired`, `payment_intent.payment_failed`,
  `charge.failed`, and `setup_intent.setup_failed` are required for orphan-cart
  and charge-failure cancellation paths. Without them, abandoned/failed
  commitments won't get cancelled in real time and will pile up at campaign
  deadline — recreating the "Min Not Met" bug.

- **Signing secret**: the dashboard shows a fresh `whsec_…` when you create
  the endpoint. Set it as `STRIPE_WEBHOOK_SECRET` in `.env.local` (and on
  Vercel preview/prod if you're configuring those endpoints).

### Verifying the webhook

After setup, fire a fake `checkout.session.expired` event:

```bash
stripe trigger checkout.session.expired
```

The route should:
1. Receive the event and pass signature verification.
2. Update the matching commitment row to `status='cancelled'`, `payment_status='cancelled'`.
3. The DB trigger should drop `lots.committed_quantity_kg` by that commitment's `quantity_kg`.

If signature verification fails (returns 400 with `"Stripe signature
verification failed"`), the most common cause is a stale or mismatched
`STRIPE_WEBHOOK_SECRET` in `.env.local`.

---

## Triggering cron jobs locally

Both Vercel cron jobs (`/api/payments/settle-deadlines` daily at 00:00 UTC,
`/api/cron/lot-expiry` daily at 01:00 UTC) can be exercised on demand
locally — useful for testing settlement / expiry logic without waiting
for the cron schedule.

```bash
# Make sure dev:up is running first.

npm run cron:settle-deadlines
# Hits the route with Authorization: Bearer $CRON_SECRET, then asserts
# every campaign transitioned out of status='active'. Fails the script
# if any campaign is still 'active' afterward.

npm run cron:lot-expiry
# Same pattern. Asserts the seeded "Expired Test Lot" was marked
# status='expired' by the route.
```

If either wrapper exits with a 401, `CRON_SECRET` doesn't match between
your `.env.local` and the route's runtime env. Both should be reading the
same `.env.local`, so this usually means stale shell state — restart
the dev server.

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

The wrapper runs a pre-flight first: every file in `supabase/migrations/`
must already be applied to your local DB. If you have a migration file
that hasn't been tested locally, it aborts before touching prod.

After the pre-flight passes, `supabase db push --linked` shows you the
diff and prompts before applying.

### CI guard

`npm run migrations:check` queries the prod ledger and fails non-zero if
any migration file in this branch is not yet applied to prod. Wire this
into a pre-push git hook (or future CI workflow) to block PR merges that
would deploy a migration without first running `db:migrate:prod`.

(CI integration with this guard is parked at the future-initiatives doc;
the script itself ships ready to invoke.)

---

## One-time prod ledger bootstrap runbook

> **This is run ONCE, by a single designated person, after the first PR
> introducing the Supabase CLI migration layout merges to `main`. Future
> contributors do NOT run this.**

CrowdRoast's 21 baseline migrations were applied to prod manually before
the Supabase CLI was adopted. As a result, prod's
`supabase_migrations.schema_migrations` table is empty even though the
schema is fully applied. Without bootstrapping the ledger,
`db:migrate:prod` would try to re-run all 21 migrations against an
already-populated schema and fail with "table already exists" errors.

The bootstrap script teaches prod's ledger about the existing files
without running their SQL.

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

`supabase migration repair --status applied` is idempotent — re-marking
an already-marked file is a no-op — so the script is safe to re-run if
it dies partway.

After this is done, future `npm run db:migrate:prod` invocations will
diff against this populated baseline and only apply genuinely-new
migrations.

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

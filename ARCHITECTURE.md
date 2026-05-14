# CrowdRoast — Application Architecture

> 🎨 **Want the visual map?** Open [`docs/architecture.html`](docs/architecture.html) in a browser for the interactive walkthrough — clickable lifecycle timeline, role tabs, money-split calculator, and a failure-mode → file lookup. This markdown stays the source of truth for prose; that page is the map for "where does X live."

## Overview

CrowdRoast is a B2B specialty coffee marketplace built around a **group-buying, hub-centric model**:

- **Sellers** list coffee lots with tiered pricing
- **Hub Owners** curate lots for their roaster communities
- **Buyers** commit as a group, unlocking better prices as volume grows
- **Settlement** automatically distributes funds post-deadline via Stripe Connect

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.1.6 (App Router, React 19) |
| Language | TypeScript 5.7.3 |
| Styling | Tailwind CSS 3.4 + Radix UI (shadcn/ui) |
| Database | PostgreSQL (hosted on Supabase) |
| Auth | Supabase Auth (JWT + secure cookies) |
| Storage | Supabase Storage (lot images) |
| Payments | Stripe (Checkout, Connect, Webhooks) |
| Deployment | Vercel |

---

## Project Structure

```
crowdroast/
├── app/
│   ├── api/                    # Backend API routes
│   ├── auth/                   # Login, sign-up, error pages
│   ├── dashboard/              # Role-gated dashboard pages
│   │   ├── seller/             # Lots, commitments, samples, payouts
│   │   ├── hub/                # Catalog, shipments, samples
│   │   └── admin/              # Roles, invitations, claims, refunds
│   └── marketplace/            # Public lot browsing + detail pages
├── components/
│   ├── ui/                     # Radix UI component wrappers (52 files)
│   └── admin/                  # Admin console component
├── lib/
│   ├── supabase/               # DB client init (server, client, admin, middleware)
│   ├── auth/                   # Admin email helpers
│   ├── payments/               # Settlement logic and calculation
│   ├── stripe.ts               # Stripe API integration
│   ├── pricing.ts              # Tiered pricing calculations
│   ├── types.ts                # Shared TypeScript types
│   └── units.ts                # Unit conversion utilities
├── hooks/                      # Custom React hooks
├── scripts/                    # Database migration SQL files
└── middleware.ts               # Auth session validation + route protection
```

---

## User Roles & Authorization

### Roles
| Role | Description | How Obtained |
|------|-------------|--------------|
| `buyer` | Default role after sign-up | Automatic |
| `seller` | Lists coffee lots | Admin approval via role request |
| `hub_owner` | Curates lots for a roaster community | Admin approval or invitation |
| `admin` | Full system access | Configured via `ADMIN_EMAIL` env var |

### Authorization Layers
1. **Middleware** (`middleware.ts`) — validates Supabase session, redirects unauthenticated users to `/auth/login`
2. **API route checks** — validate role before executing mutations
3. **Supabase RLS Policies** — database-level enforcement on every table

---

## Data Model

### Core Tables & Relationships

```
profiles ──────────────────────────── lots
(buyer/seller/hub_owner/admin)         │  (draft → active → fully_committed
  │                                    │   → shipped → delivered → closed)
  │                                    │
  ├── seller_id ──────────────────────►┤
  │                                    │
  ├── hub members ──────────► hubs ───►┤ hub_id (optional)
  │                            │       │
  │                            └───────┼──► hub_lots (curated catalog)
  │                                    │
  └── buyer_id ──────────────► commitments
                                  │  (pending → confirmed → shipped → delivered)
                                  │
                                  ├──► sample_requests
                                  ├──► claims (quality/quantity/damage disputes)
                                  └──► shipments

supporting tables:
  pricing_tiers        (volume discount tiers per lot)
  cupping_events       (sample tasting events at hubs)
  cupping_event_samples
  role_access_requests (seller/hub_owner signup requests)
  role_invitations     (admin-issued invitations)
  platform_settings    (singleton: platform Stripe account)
```

### Key Fields on `commitments`
- `payment_status`: `pending_setup | setup_complete | charge_succeeded | charge_failed | cancelled`
- `refund_status`: `not_refunded | partial | full | failed`
- `stripe_*` fields: customer, payment method, setup intent, payment intent, charge IDs

### Key Fields on `lots`
- `settlement_status`: `pending | settled | minimum_not_met | failed`
- `committed_quantity_kg` vs `total_quantity_kg` vs `min_commitment_kg`

---

## API Routes

| Route | Purpose |
|-------|---------|
| `POST /api/commitments` | Create a buyer commitment + Stripe Checkout session |
| `GET /api/lots/[id]` | Fetch lot details |
| `POST /api/lots/bulk` | Bulk import lots via CSV |
| `GET/PUT /api/samples/[id]` | Sample request management |
| `POST /api/cuppings` | Schedule a cupping event |
| `POST /api/claims` | File a quality/delivery claim |
| `GET/PUT /api/shipments/[id]` | Shipment tracking |
| `POST /api/payments/settle-deadlines` | Cron-triggered settlement job |
| `POST /api/stripe/webhook` | Stripe event handler |
| `POST /api/stripe/connect/onboard` | Seller Stripe Connect onboarding |
| `POST /api/access-requests` | Request seller/hub_owner role |
| `GET/POST /api/admin/*` | Admin management (profiles, hubs, claims, refunds, invitations) |

---

## Payment & Settlement System

> **One thing to internalize before reading the rest:** for bag-aware lots
> (every current lot — anything with a non-null `bag_size_kg`), the buyer's
> card is NOT charged at commit time. Commit time only **saves the card via
> a SetupIntent**. Actual money movement happens later, **per bag**, via a
> daily cron worker that issues one off-session PaymentIntent per
> `commitment_bag_charges` row. Payouts to the seller + hub fire only after
> all of a bag's sibling rows reach a terminal state. Legacy payment-mode
> commits (immediate charge at commit time) still exist as a fallback path
> in the codebase but no new lot hits them.

### Commitment Flow (bag-aware, setup-mode)

```
1. Buyer selects lot + quantity on the campaign page
        │
        ▼
2. POST /api/commitments
   - Resolve campaign + active seller price tier
   - Reuse or create Stripe Customer
   - Insert commitment row with payment_status='pending_setup'
   - Mint Stripe Checkout Session (mode='setup')
        │
        ▼
3. Buyer redirects to Stripe-hosted setup; attaches card
        │
        ▼
4. Stripe fires webhooks → /api/stripe/webhook
   - checkout.session.completed (mode=setup):
       • write stripe_payment_method_id + stripe_customer_id
       • flip payment_status → 'setup_complete'
       • run probeCardAuth (AC12): tiny auth+void to verify the card
         will clear at settlement. On failure, stamp payment_error +
         send the buyer the "card auth failed" email.
   - setup_intent.succeeded (fires in parallel):
       • same writes, defensive idempotent (never clobbers PM with null,
         per PR #86)
   - setup_intent.setup_failed (failure leg):
       • cancel the commit so the lot trigger drops the quantity
        │
        ▼
   Commitment now in 'setup_complete' with card on file. No money has
   moved yet. The next event is settlement at the campaign deadline.
```

### Settlement Flow (Post-Deadline Cron Job)

```
POST /api/payments/settle-deadlines  (authenticated via CRON_SECRET)
        │
        ▼
For each campaign past its deadline (status='active'):
        │
        ├─── min_bags_to_succeed NOT met ─────────────────────────┐
        │                                                          │
        │    Cancel every still-pending commitment                │
        │    Mark campaign: status='failed'                        │
        │    Buyers' cards were never charged → no refunds needed │
        │    Send AC10 "campaign didn't make it" email             │
        │                                                          │
        └─── min_bags_to_succeed MET ──────────────────────────────┤
                                                                   │
             Determine per-bag pricing via lib/settle-bag-pricing  │
             (active tier × bag_size_kg × bags filled).            │
                                                                   │
             Drop ORPHAN commits that never finished setup         │
             (PR #82's filter — these aren't valid buyers).        │
                                                                   │
             Allocate bags across confirmed commits.               │
             For each (commitment, bag_number) write one row to   │
             `commitment_bag_charges`:                              │
               - amount_cents (buyer-side gross, w/ platform fee)  │
               - kg                                                 │
               - stripe_idempotency_key                            │
                   = "charge:campaign:CC:commitment:MM:bag:N"      │
               - payment_status = 'awaiting_charge'                │
                                                                   │
             Mark campaign: status='settled', settled_at=now()     │
                                                                   │
             >>> NO Stripe call fires here. <<<                    │
             >>> The charge worker handles money.    <<<           │
```

### Charge Worker Flow (Daily Cron — `/api/cron/process-bag-charges`)

```
Vercel cron at 02:00 UTC, authenticated via CRON_SECRET.
        │
        ▼
SELECT commitment_bag_charges
WHERE payment_status IN ('awaiting_charge','retry_scheduled','charging')
  AND (next_attempt_at IS NULL OR next_attempt_at <= now())
ORDER BY next_attempt_at NULLS FIRST
LIMIT 100;
        │
        ▼
For each row (sequential — Stripe latency is the bottleneck):
        │
        1. Claim lease (UPDATE payment_status → 'charging', set a
           5-minute lease expiration). A crashed worker is reclaimed
           by the next tick once the lease window expires.
        │
        2. Gate checks:
           • commitment.payment_error set → markPaymentFailed
             reason='auth_probe_failed'
           • commitment.stripe_payment_method_id NULL → markPaymentFailed
             reason='missing_payment_method'
        │
        3. createAndConfirmPaymentIntent (off-session, deterministic
           idempotency_key from the row).
        │
        4a. Stripe succeeds:
            - Flip row → 'charged', store stripe_payment_intent_id
            - Side-effect: transferOutBagIfReady (see below)
            - Side-effect: sendSettlementEmailIfReady (see below)
        4b. Stripe declines (transient — rate limit, network):
            - Set next_attempt_at += 1h; payment_status='retry_scheduled'
        4c. Stripe declines (real — card declined, etc.):
            - Increment attempt_count
            - On attempts 1→2: send AC13 "your card declined" email
              (idempotent via payment_update_email_sent_at stamp)
            - Reschedule per the AC13 ladder:
                attempt 1 → +12h
                attempt 2 → +48h
                attempt 3 → terminal 'payment_failed'
              (Vercel Hobby caps cron at daily so actual wall-clock
              gaps are ~24h / ~48h, see route.ts comment.)
```

### Transfer-Out (Money to Seller + Hub)

```
Fires from inside the charge worker as a fire-and-forget side-effect
on every successful charge OR every terminal payment_failed.
        │
        ▼
transferOutBagIfReady(supabase, { commitmentId, bagNumber }):
        │
        1. Is every sibling row for THIS (lot, bag_number) terminal?
           ('charged' or 'payment_failed')
           NO → return 'not_ready' (no-op; next worker tick re-evaluates)
        │
        2. Idempotency guard: SELECT bag_transfers WHERE (lot_id,bag_number)
           Found → 'already_transferred'
        │
        3. Compute split (lib/payments/settlement-logic.js → computeSplit):
           Sum buyer-side cents over `charged` rows only — failed bags
           contributed no money and are excluded.
                seller_amount   = sum( round(amount / (1 + PLATFORM_FEE_RATE)) )
                hub_amount      = floor(total × HUB_SHARE_BPS / 10000)
                platform_keeps  = total − seller − hub
        │
        4. If total > 0:
              Stripe Transfer → seller Connect account
              Stripe Transfer → hub Connect account
           Else (every bag failed):
              Skip Stripe; write a zero-amount marker row anyway so the
              bag isn't re-evaluated every tick.
        │
        5. INSERT bag_transfers (lot_id, hub_id, bag_number, …)
           Note: hub_id is NOT NULL (PR #85 fix) — pulled from
           campaign.hub_id with commitment.hub_id fallback for
           pre-campaigns rows.
```

### Settlement Email Trigger

```
Fires from inside the charge worker as a fire-and-forget side-effect.
        │
        ▼
sendSettlementEmailIfReady(supabase, commitmentId):
        │
        1. Are all `commitment_bag_charges` rows for THIS commitment terminal?
           NO → return 'not_ready'
        │
        2. Claim the row (UPDATE settlement_email_sent_at = now()
           WHERE commitment_id = ? AND settlement_email_sent_at IS NULL
           RETURNING id). The claim is the dedup primitive — duplicate
           webhook deliveries / concurrent worker ticks see 0 rows
           returned and skip the email.
        │
        3. Compose + send the AC10 settlement summary email with the
           charged-vs-dropped bag breakdown.
```

### Card-Update Flow (PR #88)

```
After the AC13 "Your card declined" email OR the Needs Attention card on
the buyer dashboard, the buyer can update their card and have failed bag
charges retried automatically.
        │
        ▼
1. Buyer clicks "Update payment" on NeedsAttentionCard OR the email link.
        │
        ▼
2. POST /api/commitments/[id]/restart-setup
   - Verify the buyer owns this commit AND the commit has at least one
     `payment_failed` bag row (or legacy `charge_failed`).
   - Mint a fresh Stripe Checkout Session (mode='setup'), reusing the
     existing stripe_customer_id.
   - Update commit: payment_status='pending_setup', stash new session id,
     clear payment_error.
   - Return the Stripe redirect URL.
        │
        ▼
3. Buyer redirects to Stripe, attaches the new card.
        │
        ▼
4. Stripe fires webhooks — same handlers as the initial commit flow PLUS:
   - rearmFailedBagCharges(supabase, { commitmentId, newSetupIntentId }):
       For every commitment_bag_charges row with payment_status='payment_failed':
         • Flip → 'awaiting_charge'
         • Reset attempt_count = 0, clear failed_reason / next_attempt_at
         • Rotate stripe_idempotency_key → "retry:<new_seti_id>:bag:<N>"
           (the old key is locked in Stripe's idempotency cache pointing
           at the failed PaymentIntent; reusing it would replay the
           decline).
         • Clear payment_update_email_sent_at so a fresh failure can
           re-send the email.
   - Gated on probe.ok (CS path) / payment_method present (SI path) —
     a declined new card cannot unlock retries.
        │
        ▼
5. Next charge worker tick picks up the awaiting_charge rows and tries
   to charge them with the new card.
```

### Pricing Model

| Party | Revenue |
|-------|---------|
| Seller | Base price per kg × quantity (no fees deducted) |
| Hub | 2% of gross (gross = seller price × 1.10 platform markup) |
| Platform | Gross − Seller − Hub |

Volume tiers in `pricing_tiers` unlock lower prices per kg as the number of completed bags grows. A tier applies when `floor(total_committed_kg / bag_size_kg)` reaches the tier's `min_bags`. The legacy `min_quantity_kg` column is nullable (migrations #36–#37) and only used for unconverted legacy lots; new lots store thresholds in `min_bags`. Buyer, seller, and hub UI resolve "current price" and "X to next tier" through `lib/tier-progress.ts`, which mirrors the bag-aware rule used at settlement (`lib/settle-bag-pricing.ts`).

### Stripe Connect Architecture

```
Buyer's card ──► Platform Stripe Account
                      │
                      ├──► Transfer to Seller Connect Express Account
                      ├──► Transfer to Hub Connect Express Account
                      └──► Platform retains remainder
```

---

## Background Jobs

Three crons run in sequence each night. The 1-hour offsets between them are intentional — they let each step's writes propagate before the next reads them.

### Settle-Deadlines Cron (`/api/payments/settle-deadlines`)
- **Schedule:** 00:00 UTC daily (`vercel.json`).
- **Auth:** Bearer token or `x-cron-secret` header matching `CRON_SECRET`.
- **What it does:** Looks at every campaign whose deadline has passed. If the campaign hit `min_bags_to_succeed`, it writes the per-bag `commitment_bag_charges` rows and flips the campaign to `settled`. If not, cancels all commits and flips the campaign to `failed`.
- **Idempotency:** `UPSERT (commitment_id, bag_number) ON CONFLICT DO NOTHING` on the bag-charges insert; campaign status flip is naturally idempotent.
- **Debug Mode:** `?debug=1` for dry-run output.
- **Does NOT charge any cards.** Hands off to the charge worker by writing rows.

### Lot-Expiry Cron (`/api/payments/lot-expiry`)
- **Schedule:** 01:00 UTC daily.
- **Auth:** Same `CRON_SECRET` pattern.
- **What it does:** Closes out lots whose `expiry_date` has passed without re-listing.

### Charge Worker Cron (`/api/cron/process-bag-charges`)
- **Schedule:** 02:00 UTC daily (Vercel Hobby cap; would run hourly on Pro).
- **Auth:** Same `CRON_SECRET` pattern.
- **What it does:** Picks up due `commitment_bag_charges` rows (`awaiting_charge`, `retry_scheduled`, or stale `charging` leases) and issues one off-session PaymentIntent per row. See "Charge Worker Flow" above for the per-row state machine.
- **Idempotency:** Each row carries a deterministic `stripe_idempotency_key`. The row is the durable marker; Stripe's idempotency cache is the secondary guard. After restart-setup (#88), the key is rotated to `retry:<seti_id>:bag:<N>` so a fresh card can be retried.
- **Lease window:** 5 minutes. A crashed mid-Stripe-call worker is reclaimed on the next tick once the lease expires.
- **Wall-clock cap:** 4 minutes inside a 300-second function budget. Remaining rows roll to the next tick.
- **Returns:** HTTP **207 Multi-Status** when any row terminated as `payment_failed` (a normal-day signal for monitoring, not an error).

---

## Authentication Flow

```
User visits protected page
        │
        ▼
middleware.ts validates Supabase session cookie
        │
   No session ──► redirect to /auth/login
        │
   Session valid
        │
        ▼
Server component calls createClient() → gets authenticated user
        │
        ▼
API routes check user role before mutations
Database RLS enforces per-row access
```

---

## External Services

| Service | Purpose | Key Env Vars |
|---------|---------|-------------|
| Supabase | Database, Auth, Storage | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Stripe | Payments, Connect, Webhooks | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Vercel | Deployment, cron scheduling | — |

---

## Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=         # backend-only, bypasses RLS

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Admin & Cron
CRON_SECRET=                       # protects settlement endpoint
ADMIN_EMAIL=                       # single admin email
ADMIN_EMAILS=                      # comma-separated admin emails

# App
NEXT_PUBLIC_APP_URL=
CROWDROAST_STRIPE_CONNECT_ACCOUNT_ID=   # legacy platform account fallback
```

---

## Key Business Logic Files

| File | Responsibility |
|------|---------------|
| [lib/payments/settlement-logic.js](lib/payments/settlement-logic.js) | Core settlement math: tier lookup, splits, refund calculations |
| [lib/settle-bag-pricing.ts](lib/settle-bag-pricing.ts) | Bag-aware pricing — resolves the active tier × bag_size_kg at settlement time |
| [lib/pricing.ts](lib/pricing.ts) | Tiered price calculation for display |
| [lib/tier-progress.ts](lib/tier-progress.ts) | Shared bag-aware "current tier + kg-to-next" helper (buyer/seller/hub UI) |
| [lib/stripe.ts](lib/stripe.ts) | Stripe API wrappers (charges, transfers, refunds, Connect onboarding) |
| [lib/charge-worker.ts](lib/charge-worker.ts) | Per-row charge logic for `commitment_bag_charges`. AC13 retry ladder lives here |
| [lib/bag-transfer-out.ts](lib/bag-transfer-out.ts) | Seller + hub Stripe transfers once every bag-row sibling is terminal |
| [lib/bag-charge-rearm.ts](lib/bag-charge-rearm.ts) | Re-arms `payment_failed` bag rows after a buyer attaches a new card (PR #88) |
| [lib/settlement-email-trigger.ts](lib/settlement-email-trigger.ts) | Fires the AC10 settlement summary email once every bag row terminates |
| [lib/auth/admin.ts](lib/auth/admin.ts) | Admin email verification helpers |
| [app/api/payments/settle-deadlines/route.ts](app/api/payments/settle-deadlines/route.ts) | Settlement cron — writes bag-charge rows, does NOT charge cards |
| [app/api/cron/process-bag-charges/route.ts](app/api/cron/process-bag-charges/route.ts) | Daily charge worker cron — dispatches `processBagCharge` per row |
| [app/api/stripe/webhook/route.ts](app/api/stripe/webhook/route.ts) | Stripe event processing (setup-mode + payment-mode + decline events) |
| [app/api/commitments/route.ts](app/api/commitments/route.ts) | Commitment creation + Stripe Checkout (setup-mode for bag-aware lots) |
| [app/api/commitments/[id]/restart-setup/route.ts](app/api/commitments/[id]/restart-setup/route.ts) | Buyer-initiated card-update flow (PR #88) |
| [components/buyer-commitments/bucket-by-lifecycle.ts](components/buyer-commitments/bucket-by-lifecycle.ts) | Buyer dashboard bucketing + portfolio stats; bag-aware derivations live here |

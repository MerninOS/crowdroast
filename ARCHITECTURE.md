# CrowdRoast — Application Architecture

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

### Commitment Flow

```
1. Buyer selects lot + quantity
        │
        ▼
2. POST /api/commitments
   - Calculate price with 10% platform markup
   - Create Stripe Customer (if new)
   - Create Checkout Session (setup mode → save payment method)
        │
        ▼
3. Buyer completes Stripe Checkout
        │
        ▼
4. Stripe fires webhook → /api/stripe/webhook
   - checkout.session.completed → mark payment_status = 'setup_complete'
   - Store stripe_payment_method_id on commitment
```

### Settlement Flow (Post-Deadline Cron Job)

```
POST /api/payments/settle-deadlines  (authenticated via CRON_SECRET)
        │
        ▼
Fetch all lots where:
  commitment_deadline ≤ now
  settlement_status = 'pending'
        │
        ├─── minimum NOT met ────────────────────────────────────┐
        │                                                         │
        │    Refund all charge_succeeded commitments             │
        │    Cancel all commitments                               │
        │    Mark lot: settlement_status = 'minimum_not_met'     │
        │                                                         │
        └─── minimum MET ─────────────────────────────────────────┤
                                                                  │
             Apply volume tier discounts (if better tier reached) │
             Compute splits:                                       │
               Seller  = base price × quantity                    │
               Hub     = 2% of gross amount (HUB_SHARE_BPS=200)  │
               Platform = gross - seller - hub                    │
                                                                  │
             Create Stripe Transfers:                             │
               → Seller Connect Account                           │
               → Hub Connect Account                              │
               → Platform Connect Account                         │
                                                                  │
             If price decreased (tier discount): issue refund     │
             Mark lot: settlement_status = 'settled'              │
```

### Pricing Model

| Party | Revenue |
|-------|---------|
| Seller | Base price per kg × quantity (no fees deducted) |
| Hub | 2% of gross (gross = seller price × 1.10 platform markup) |
| Platform | Gross − Seller − Hub |

Volume tiers in `pricing_tiers` unlock lower prices per kg as total committed quantity grows.

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

### Settlement Cron (`/api/payments/settle-deadlines`)
- **Auth:** Bearer token or `x-cron-secret` header matching `CRON_SECRET`
- **Idempotency:** Stripe idempotency keys (`commitment-charge-{id}`, `transfer-seller-{id}`, etc.)
- **Debug Mode:** `?debug=1` for dry-run output
- **Failure Handling:**
  - Missing seller Connect account → lot marked `settlement_status = 'failed'`
  - Stripe API error → remains `pending` for retry on next run

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
| [lib/pricing.ts](lib/pricing.ts) | Tiered price calculation for display |
| [lib/stripe.ts](lib/stripe.ts) | Stripe API wrappers (charges, transfers, refunds, Connect onboarding) |
| [lib/auth/admin.ts](lib/auth/admin.ts) | Admin email verification helpers |
| [app/api/payments/settle-deadlines/route.ts](app/api/payments/settle-deadlines/route.ts) | Settlement cron orchestrator |
| [app/api/stripe/webhook/route.ts](app/api/stripe/webhook/route.ts) | Stripe event processing |
| [app/api/commitments/route.ts](app/api/commitments/route.ts) | Commitment creation + Stripe Checkout |

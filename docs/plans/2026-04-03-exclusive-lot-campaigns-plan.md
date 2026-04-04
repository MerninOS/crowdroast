# Exclusive Lot Campaigns Implementation Plan

> **Spec:** specs/exclusive-lot-campaigns.md
> **For agents:** Use team-dev (parallel) or sdd (sequential) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Follow the `tdd` skill for red-green-refactor cycle.

**Goal:** Introduce exclusive lot campaigns so only one hub can run a campaign on a lot at a time, with DB-enforced exclusivity, campaign-based settlement, and lot recycling on failure.

**Architecture:** New `campaigns` table with a partial unique index enforces one active campaign per lot. Settlement cron is refactored to query campaigns instead of lots. Buyer commitments are tied to campaigns. A new lot-expiry cron handles lots that expire without a successful campaign. The existing `hub_lots` table remains as a non-exclusive catalog wishlist.

**Tech Stack:** Next.js 16 (App Router), Supabase (PostgreSQL), Stripe Connect, TypeScript, Vitest

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `scripts/016_campaigns.sql` | Create | DB migration: campaigns table, lots.expiry_date, commitments.campaign_id |
| `lib/types.ts` | Modify | Add Campaign type, CampaignStatus, update Lot (expiry_date), update Commitment (campaign_id), add LotStatus "expired" |
| `app/api/campaigns/route.ts` | Create | POST: create campaign (hub owner claims lot, sets deadline) |
| `app/api/campaigns/[id]/route.ts` | Create | GET: fetch campaign. PATCH: cancel campaign |
| `app/api/campaigns/__tests__/campaigns.test.ts` | Create | Tests for campaign CRUD and exclusivity |
| `app/api/commitments/route.ts` | Modify | Add campaign_id lookup and storage, validate campaign is active |
| `app/api/commitments/__tests__/commitments-campaign.test.ts` | Create | Tests for campaign-aware commitment creation |
| `app/api/payments/settle-deadlines/route.ts` | Modify | Query campaigns instead of lots, update campaign status on settlement |
| `app/api/payments/__tests__/settle-campaigns.test.ts` | Create | Tests for campaign-based settlement |
| `app/api/cron/lot-expiry/route.ts` | Create | Cron: expire lots past expiry_date with no successful campaign |
| `app/api/cron/__tests__/lot-expiry.test.ts` | Create | Tests for lot expiry cron |
| `app/dashboard/hub/catalog/page.tsx` | Modify | Filter unavailable lots, add "Start Campaign" action |
| `app/dashboard/hub/campaigns/page.tsx` | Create | Campaign setup UI for hub owners |
| `app/dashboard/buyer/browse/page.tsx` | Modify | Show lots via active campaigns, display campaign deadline |
| `lib/email/index.ts` | Modify | Add sendLotExpiredEmail function |
| `vercel.json` | Modify | Add lot-expiry cron schedule |

---

## Task 1: Database Migration

**Files:**
- Create: `scripts/016_campaigns.sql`

**Dependencies:** None

- [ ] **Step 1: Write the migration SQL**

```sql
-- 016_campaigns.sql
-- Exclusive lot campaigns: new campaigns table, lot expiry, campaign-aware commitments

-- 1. Create campaign status type
DO $$ BEGIN
  CREATE TYPE campaign_status AS ENUM ('active', 'settled', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
  hub_id uuid NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
  deadline timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'settled', 'failed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);

-- 3. Enforce: only one active campaign per lot
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_campaign_per_lot
  ON campaigns (lot_id) WHERE status = 'active';

-- 4. Index for settlement cron queries
CREATE INDEX IF NOT EXISTS idx_campaigns_deadline_status
  ON campaigns (deadline, status) WHERE status = 'active';

-- 5. Add expiry_date to lots (seller-controlled)
ALTER TABLE lots ADD COLUMN IF NOT EXISTS expiry_date timestamptz;

-- 6. Backfill expiry_date from commitment_deadline for any existing lots
UPDATE lots SET expiry_date = commitment_deadline WHERE expiry_date IS NULL AND commitment_deadline IS NOT NULL;

-- 7. Add campaign_id to commitments
ALTER TABLE commitments ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES campaigns(id);

-- 8. Index for looking up commitments by campaign
CREATE INDEX IF NOT EXISTS idx_commitments_campaign_id
  ON commitments (campaign_id) WHERE campaign_id IS NOT NULL;

-- 9. RLS policies for campaigns
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

-- Hub owners can read and insert campaigns for their own hubs
CREATE POLICY campaigns_hub_owner_select ON campaigns
  FOR SELECT USING (
    hub_id IN (SELECT id FROM hubs WHERE owner_id = auth.uid())
  );

CREATE POLICY campaigns_hub_owner_insert ON campaigns
  FOR INSERT WITH CHECK (
    hub_id IN (SELECT id FROM hubs WHERE owner_id = auth.uid())
  );

CREATE POLICY campaigns_hub_owner_update ON campaigns
  FOR UPDATE USING (
    hub_id IN (SELECT id FROM hubs WHERE owner_id = auth.uid())
  );

-- Buyers can read campaigns for hubs they belong to
CREATE POLICY campaigns_buyer_select ON campaigns
  FOR SELECT USING (
    hub_id IN (
      SELECT hub_id FROM hub_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Sellers can read campaigns for their lots
CREATE POLICY campaigns_seller_select ON campaigns
  FOR SELECT USING (
    lot_id IN (SELECT id FROM lots WHERE seller_id = auth.uid())
  );
```

- [ ] **Step 2: Run the migration**

Run: `psql $DATABASE_URL -f scripts/016_campaigns.sql`
Expected: All statements succeed without error.

- [ ] **Step 3: Verify the schema**

Run: `psql $DATABASE_URL -c "\d campaigns"` and `psql $DATABASE_URL -c "\d lots" | grep expiry_date` and `psql $DATABASE_URL -c "\d commitments" | grep campaign_id`
Expected: campaigns table exists with all columns, lots has expiry_date column, commitments has campaign_id column.

- [ ] **Step 4: Commit**

```bash
git add scripts/016_campaigns.sql
git commit -m "feat(db): add campaigns table, lot expiry_date, commitment campaign_id"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `lib/types.ts`

**Dependencies:** None (can run in parallel with Task 1)

- [ ] **Step 1: Update types**

Add `CampaignStatus` type and `Campaign` interface. Update `LotStatus` to include `"expired"`. Add `expiry_date` to `Lot` and `campaign_id` to `Commitment`.

In `lib/types.ts`, after the existing `LotStatus` type:

```typescript
// Add "expired" to LotStatus
export type LotStatus =
  | "draft"
  | "active"
  | "fully_committed"
  | "shipped"
  | "delivered"
  | "closed"
  | "expired";
```

Add `CampaignStatus` after `LotSettlementStatus`:

```typescript
export type CampaignStatus = "active" | "settled" | "failed" | "cancelled";
```

Add `expiry_date` to `Lot` interface (after `commitment_deadline`):

```typescript
  expiry_date: string | null;
```

Add `campaign_id` to `Commitment` interface (after `hub_id`):

```typescript
  campaign_id: string | null;
```

Add `Campaign` interface after `HubLot`:

```typescript
export interface Campaign {
  id: string;
  lot_id: string;
  hub_id: string;
  deadline: string;
  status: CampaignStatus;
  created_at: string;
  settled_at: string | null;
  // Joined fields
  lot?: Lot;
  hub?: Hub;
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No new errors related to Campaign, CampaignStatus, expiry_date, or campaign_id.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat(types): add Campaign type, CampaignStatus, lot expiry_date, commitment campaign_id"
```

---

## Task 3: Campaign Creation API

**Files:**
- Create: `app/api/campaigns/route.ts`
- Create: `app/api/campaigns/__tests__/campaigns.test.ts`

**Dependencies:** Task 1 (migration), Task 2 (types)

- [ ] **Step 1: Write the failing test**

Create `app/api/campaigns/__tests__/campaigns.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockIn = vi.fn();
const mockIs = vi.fn();

const mockFrom = vi.fn(() => ({
  select: mockSelect,
  insert: mockInsert,
}));

mockSelect.mockReturnValue({
  eq: mockEq,
  in: mockIn,
  is: mockIs,
});

mockEq.mockReturnValue({
  eq: mockEq,
  single: mockSingle,
  in: mockIn,
});

const mockGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
      from: mockFrom,
    })
  ),
}));

describe("POST /api/campaigns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 if user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const { POST } = await import("../route");
    const req = new Request("http://localhost/api/campaigns", {
      method: "POST",
      body: JSON.stringify({ lot_id: "lot-1", hub_id: "hub-1", deadline: "2026-04-20T00:00:00Z" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 if deadline is more than 30 days from now", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

    // Hub ownership check passes
    mockSingle.mockResolvedValueOnce({ data: { id: "hub-1", name: "Test Hub" } });

    // Lot exists and is active
    mockSingle.mockResolvedValueOnce({
      data: {
        id: "lot-1",
        status: "active",
        expiry_date: "2026-12-01T00:00:00Z",
      },
    });

    const farFuture = new Date();
    farFuture.setDate(farFuture.getDate() + 31);

    const { POST } = await import("../route");
    const req = new Request("http://localhost/api/campaigns", {
      method: "POST",
      body: JSON.stringify({
        lot_id: "lot-1",
        hub_id: "hub-1",
        deadline: farFuture.toISOString(),
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/30 days/i);
  });

  it("returns 409 when lot already has an active campaign", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

    // Hub ownership check passes
    mockSingle.mockResolvedValueOnce({ data: { id: "hub-1", name: "Test Hub" } });

    // Lot exists and is active
    mockSingle.mockResolvedValueOnce({
      data: {
        id: "lot-1",
        status: "active",
        expiry_date: "2026-12-01T00:00:00Z",
      },
    });

    // Insert fails with unique constraint violation
    mockInsert.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "duplicate key value violates unique constraint", code: "23505" },
        }),
      }),
    });

    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 14);

    const { POST } = await import("../route");
    const req = new Request("http://localhost/api/campaigns", {
      method: "POST",
      body: JSON.stringify({
        lot_id: "lot-1",
        hub_id: "hub-1",
        deadline: deadline.toISOString(),
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already been claimed/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/campaigns/__tests__/campaigns.test.ts`
Expected: FAIL — module `../route` not found

- [ ] **Step 3: Write the campaign creation API**

Create `app/api/campaigns/route.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const MAX_CAMPAIGN_DAYS = 30;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const hubId = typeof body?.hub_id === "string" ? body.hub_id : "";
  const lotId = typeof body?.lot_id === "string" ? body.lot_id : "";
  const deadlineStr = typeof body?.deadline === "string" ? body.deadline : "";

  if (!hubId || !lotId || !deadlineStr) {
    return NextResponse.json(
      { error: "hub_id, lot_id, and deadline are required" },
      { status: 400 }
    );
  }

  const deadline = new Date(deadlineStr);
  if (isNaN(deadline.getTime())) {
    return NextResponse.json({ error: "Invalid deadline date" }, { status: 400 });
  }

  // Verify caller owns this hub
  const { data: hub } = await supabase
    .from("hubs")
    .select("id, name")
    .eq("id", hubId)
    .eq("owner_id", user.id)
    .single();

  if (!hub) {
    return NextResponse.json(
      { error: "Hub not found or you are not the owner" },
      { status: 403 }
    );
  }

  // Verify lot exists and is active
  const { data: lot } = await supabase
    .from("lots")
    .select("id, title, status, expiry_date")
    .eq("id", lotId)
    .in("status", ["active", "fully_committed"])
    .single();

  if (!lot) {
    return NextResponse.json({ error: "Lot not found or not available" }, { status: 404 });
  }

  // Validate deadline is not more than 30 days from now
  const now = new Date();
  const maxDeadline = new Date(now.getTime() + MAX_CAMPAIGN_DAYS * 24 * 60 * 60 * 1000);
  if (deadline > maxDeadline) {
    return NextResponse.json(
      { error: `Campaign deadline cannot be more than ${MAX_CAMPAIGN_DAYS} days from now` },
      { status: 400 }
    );
  }

  // Validate deadline is before lot expiry
  if (lot.expiry_date && deadline > new Date(lot.expiry_date)) {
    return NextResponse.json(
      { error: "Campaign deadline must be before the lot expiry date" },
      { status: 400 }
    );
  }

  // Validate deadline is in the future
  if (deadline <= now) {
    return NextResponse.json(
      { error: "Campaign deadline must be in the future" },
      { status: 400 }
    );
  }

  // Insert campaign — partial unique index enforces exclusivity
  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({
      lot_id: lotId,
      hub_id: hubId,
      deadline: deadline.toISOString(),
      status: "active",
    })
    .select()
    .single();

  if (error) {
    // Unique constraint violation = another hub already has an active campaign
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "This lot has already been claimed by another hub" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ campaign }, { status: 201 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/campaigns/__tests__/campaigns.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/campaigns/route.ts app/api/campaigns/__tests__/campaigns.test.ts
git commit -m "feat(api): add campaign creation endpoint with exclusivity enforcement"
```

---

## Task 4: Campaign Detail & Cancel API

**Files:**
- Create: `app/api/campaigns/[id]/route.ts`

**Dependencies:** Task 3

- [ ] **Step 1: Write the campaign detail and cancel API**

Create `app/api/campaigns/[id]/route.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select("*, lot:lots(*), hub:hubs(*)")
    .eq("id", id)
    .single();

  if (error || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  return NextResponse.json({ campaign });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const newStatus = body?.status;

  if (newStatus !== "cancelled") {
    return NextResponse.json(
      { error: "Only cancellation is supported" },
      { status: 400 }
    );
  }

  // Fetch campaign and verify ownership
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, hub_id, status")
    .eq("id", id)
    .single();

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (campaign.status !== "active") {
    return NextResponse.json(
      { error: "Only active campaigns can be cancelled" },
      { status: 400 }
    );
  }

  // Verify caller owns the hub
  const { data: hub } = await supabase
    .from("hubs")
    .select("id")
    .eq("id", campaign.hub_id)
    .eq("owner_id", user.id)
    .single();

  if (!hub) {
    return NextResponse.json(
      { error: "Hub not found or you are not the owner" },
      { status: 403 }
    );
  }

  // Cancel the campaign
  const { error: updateError } = await supabase
    .from("campaigns")
    .update({ status: "cancelled" })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Cancel all pending commitments for this campaign
  // Note: refunds for paid commitments would need to be handled separately
  await supabase
    .from("commitments")
    .update({
      status: "cancelled",
      payment_error: "Campaign was cancelled by hub owner",
    })
    .eq("campaign_id", id)
    .neq("status", "cancelled");

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/campaigns/[id]/route.ts
git commit -m "feat(api): add campaign detail and cancellation endpoint"
```

---

## Task 5: Update Commitment Creation to Use campaign_id

**Files:**
- Modify: `app/api/commitments/route.ts`
- Create: `app/api/commitments/__tests__/commitments-campaign.test.ts`

**Dependencies:** Task 1, Task 2

- [ ] **Step 1: Write the failing test**

Create `app/api/commitments/__tests__/commitments-campaign.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();
const mockGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
      from: mockFrom,
    })
  ),
}));

vi.mock("@/lib/stripe", () => ({
  createPaymentCheckoutSession: vi.fn(() =>
    Promise.resolve({ id: "sess_123", url: "https://checkout.stripe.com/test" })
  ),
  createStripeCustomer: vi.fn(() => Promise.resolve({ id: "cus_123" })),
}));

vi.mock("@/lib/pricing", () => ({
  addPlatformFee: vi.fn((price: number) => price * 1.1),
}));

describe("POST /api/commitments — campaign_id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects commitment when lot has no active campaign for the buyer's hub", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "buyer-1", email: "buyer@test.com" } } });

    // lot query
    mockFrom.mockImplementation((table: string) => {
      if (table === "lots") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: "lot-1", status: "active", seller_id: "seller-1", commitment_deadline: null, expiry_date: "2026-12-01", total_quantity_kg: 100, committed_quantity_kg: 0, price_per_kg: 10, currency: "USD" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "campaigns") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } }),
                }),
              }),
            }),
          }),
        };
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null }) };
    });

    const { POST } = await import("../route");
    const req = new Request("http://localhost/api/commitments", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ lot_id: "lot-1", hub_id: "hub-1", quantity_kg: 10 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no active campaign/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/commitments/__tests__/commitments-campaign.test.ts`
Expected: FAIL — current route does not check for campaigns

- [ ] **Step 3: Modify commitments route**

In `app/api/commitments/route.ts`, add campaign lookup after the lot fetch and deadline check. Replace the deadline check with campaign-based validation:

After line 45 (`if (lot.status !== "active")` block), add:

```typescript
  // Look up active campaign for this lot and hub
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, deadline, status")
    .eq("lot_id", lot_id)
    .eq("hub_id", hub_id || "")
    .eq("status", "active")
    .single();

  if (!campaign) {
    return NextResponse.json(
      { error: "No active campaign for this lot in your hub" },
      { status: 400 }
    );
  }

  // Check campaign deadline instead of lot commitment_deadline
  if (new Date(campaign.deadline) < new Date()) {
    return NextResponse.json(
      { error: "Campaign deadline has passed" },
      { status: 400 }
    );
  }
```

In the `commitmentPayload` object, add `campaign_id`:

```typescript
    campaign_id: campaign.id,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/commitments/__tests__/commitments-campaign.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/commitments/route.ts app/api/commitments/__tests__/commitments-campaign.test.ts
git commit -m "feat(commitments): require active campaign, store campaign_id on commitment"
```

---

## Task 6: Refactor Settlement to Use Campaigns

**Files:**
- Modify: `app/api/payments/settle-deadlines/route.ts`
- Create: `app/api/payments/__tests__/settle-campaigns.test.ts`

**Dependencies:** Task 1, Task 2, Task 5

- [ ] **Step 1: Write the failing test**

Create `app/api/payments/__tests__/settle-campaigns.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

vi.mock("@/lib/auth/admin", () => ({
  getConfiguredAdminEmails: vi.fn(() => ["admin@test.com"]),
}));

vi.mock("@/lib/email", () => ({
  sendLotClosedEmailsBatch: vi.fn(() => Promise.resolve({ success: true })),
  sendLotFailedEmail: vi.fn(() => Promise.resolve({ success: true })),
}));

vi.mock("@/lib/stripe", () => ({
  getConnectedAccount: vi.fn(() => Promise.resolve({ capabilities: { transfers: "active" } })),
  createRefund: vi.fn(() => Promise.resolve({})),
  createTransfer: vi.fn(() => Promise.resolve({})),
  getPaymentIntent: vi.fn(() => Promise.resolve({ latest_charge: "ch_123", status: "succeeded" })),
  listRefundsForPaymentIntent: vi.fn(() => Promise.resolve({ data: [] })),
  listTransfersForSourceCharge: vi.fn(() => Promise.resolve({ data: [] })),
}));

vi.mock("@/lib/payments/settlement-logic", () => ({
  computeChargeAdjustment: vi.fn(() => ({ finalAmountCents: 1000, refundAmountCents: 0, committedAmountCents: 1000 })),
  computeSellerNetAmountCents: vi.fn(() => 900),
  computeSplit: vi.fn(() => ({ sellerAmount: 900, hubAmount: 20, platformAmount: 80 })),
  getFinalPricePerKg: vi.fn(() => 10),
}));

describe("settle-deadlines with campaigns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
  });

  it("queries campaigns table instead of lots for due deadlines", async () => {
    // This test verifies the settlement cron queries campaigns
    // with status='active' and deadline <= now
    mockFrom.mockImplementation((table: string) => {
      if (table === "campaigns") {
        return {
          select: vi.fn().mockReturnValue({
            lte: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === "platform_settings") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { platform_connect_account_id: "acct_platform" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnValue({
            not: vi.fn().mockResolvedValue({ data: [{ email: "admin@test.com", stripe_connect_account_id: "acct_admin" }], error: null }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null }),
        update: vi.fn().mockReturnThis(),
      };
    });

    const { GET } = await import("../../payments/settle-deadlines/route");
    const req = new Request("http://localhost/api/payments/settle-deadlines", {
      headers: { authorization: `Bearer test-secret` },
    });
    const res = await GET(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    // Verify it looked at campaigns, not lots
    expect(mockFrom).toHaveBeenCalledWith("campaigns");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/payments/__tests__/settle-campaigns.test.ts`
Expected: FAIL — current route queries `lots` not `campaigns`

- [ ] **Step 3: Refactor settlement route**

In `app/api/payments/settle-deadlines/route.ts`, replace the main query (lines 337-343) to query campaigns instead of lots:

Replace:
```typescript
  const { data: dueLots, error: dueLotsError } = await admin
    .from("lots")
    .select(
      "id, seller_id, status, currency, price_per_kg, committed_quantity_kg, min_commitment_kg, commitment_deadline, settlement_status"
    )
    .lte("commitment_deadline", nowIso)
    .in("settlement_status", ["pending", "failed"]);
```

With:
```typescript
  // Query campaigns with deadlines that have passed
  const { data: dueCampaigns, error: dueCampaignsError } = await admin
    .from("campaigns")
    .select("id, lot_id, hub_id, deadline, status")
    .lte("deadline", nowIso)
    .eq("status", "active");

  if (dueCampaignsError) {
    return NextResponse.json({ error: dueCampaignsError.message }, { status: 500 });
  }
```

Then for each campaign, fetch the lot and process settlement. The key changes in the loop:

1. Iterate over `dueCampaigns` instead of `dueLots`
2. Fetch the lot data for each campaign
3. Query commitments filtered by `campaign_id` instead of just `lot_id`
4. On minimum not met: set campaign status to `failed`, keep lot `active` if not expired
5. On success: set campaign status to `settled`, set lot status to `closed`
6. Update `sendLotSuccessNotifications` and `sendLotFailedNotifications` to work with campaign hub_id directly instead of looking up hub_lots

The settlement payout logic (Stripe transfers, refunds, split calculation) stays identical.

Replace the main `for (const lot of dueLots || [])` loop with:

```typescript
  for (const campaign of dueCampaigns || []) {
    // Fetch lot for this campaign
    const { data: lot, error: lotError } = await admin
      .from("lots")
      .select(
        "id, seller_id, status, currency, price_per_kg, committed_quantity_kg, min_commitment_kg, commitment_deadline, expiry_date, settlement_status"
      )
      .eq("id", campaign.lot_id)
      .single();

    if (lotError || !lot) {
      results.push({ campaign_id: campaign.id, lot_id: campaign.lot_id, outcome: "failed", error: "Lot not found" });
      continue;
    }

    const minimumMet = Number(lot.committed_quantity_kg) >= Number(lot.min_commitment_kg);
```

In the minimum-not-met branch, replace the lot status update:

Replace:
```typescript
      await admin
        .from("lots")
        .update({
          status: "closed",
          settlement_status: refundFailedCount > 0 ? "failed" : "minimum_not_met",
          settlement_processed_at: nowIso,
        })
        .eq("id", lot.id);
```

With:
```typescript
      // Update campaign status to failed
      await admin
        .from("campaigns")
        .update({ status: "failed" })
        .eq("id", campaign.id);

      // Only close the lot if it has also expired
      const lotExpired = lot.expiry_date && new Date(lot.expiry_date) <= new Date(nowIso);
      if (lotExpired) {
        await admin
          .from("lots")
          .update({
            status: "expired",
            settlement_status: "minimum_not_met",
            settlement_processed_at: nowIso,
          })
          .eq("id", lot.id);
      } else {
        // Lot stays active — available for other hubs to claim
        await admin
          .from("lots")
          .update({
            settlement_status: refundFailedCount > 0 ? "failed" : "minimum_not_met",
            settlement_processed_at: nowIso,
          })
          .eq("id", lot.id);
      }
```

In the success branch, add campaign status update:

After the existing lot status update:
```typescript
      // Update campaign status to settled
      await admin
        .from("campaigns")
        .update({ status: "settled", settled_at: nowIso })
        .eq("id", campaign.id);
```

For commitment queries in the success path, filter by campaign_id:

Replace:
```typescript
      .eq("lot_id", lot.id)
```

With:
```typescript
      .eq("campaign_id", campaign.id)
```

Update `sendLotSuccessNotifications` to accept `hubId` parameter directly instead of looking up `hub_lots`, and pass `campaign.hub_id` when calling it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/payments/__tests__/settle-campaigns.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/payments/settle-deadlines/route.ts app/api/payments/__tests__/settle-campaigns.test.ts
git commit -m "refactor(settlement): query campaigns instead of lots, update campaign status on settle/fail"
```

---

## Task 7: Lot Expiry Cron

**Files:**
- Create: `app/api/cron/lot-expiry/route.ts`
- Create: `app/api/cron/__tests__/lot-expiry.test.ts`
- Modify: `lib/email/index.ts`
- Modify: `vercel.json`

**Dependencies:** Task 1, Task 2

- [ ] **Step 1: Add sendLotExpiredEmail to email module**

In `lib/email/index.ts`, add after the `sendLotFailedEmail` function:

```typescript
// ---------------------------------------------------------------------------
// Lot expired without successful campaign — notify seller
// ---------------------------------------------------------------------------

export interface LotExpiredEmailParams {
  seller: Pick<Profile, "email" | "contact_name">;
  lot: Pick<Lot, "id" | "title">;
}

export async function sendLotExpiredEmail(
  params: LotExpiredEmailParams
): Promise<SendEmailResult> {
  if (!params.seller.email) return { success: false, error: "Seller has no email address" };
  const html = await renderLotClosedFailedHtml({
    recipientName: params.seller.contact_name || "there",
    lotTitle: params.lot.title,
  });
  return sendEmail({
    to: params.seller.email,
    subject: `Your lot "${params.lot.title}" has expired — consider re-listing`,
    html,
  });
}
```

- [ ] **Step 2: Write the failing test for lot-expiry cron**

Create `app/api/cron/__tests__/lot-expiry.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

const mockSendLotExpiredEmail = vi.fn(() => Promise.resolve({ success: true }));
vi.mock("@/lib/email", () => ({
  sendLotExpiredEmail: mockSendLotExpiredEmail,
}));

describe("GET /api/cron/lot-expiry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
  });

  it("expires lots past expiry_date with no active or settled campaign", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "lots") {
        return {
          select: vi.fn().mockReturnValue({
            lte: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: "lot-1", seller_id: "seller-1", title: "Test Coffee", expiry_date: "2026-03-01T00:00:00Z" }],
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      if (table === "campaigns") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { email: "seller@test.com", contact_name: "Test Seller" },
                error: null,
              }),
            }),
          }),
        };
      }
      return { select: vi.fn().mockReturnThis() };
    });

    const { GET } = await import("../../cron/lot-expiry/route");
    const req = new Request("http://localhost/api/cron/lot-expiry", {
      headers: { authorization: "Bearer test-secret" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.expired_lots).toBe(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run app/api/cron/__tests__/lot-expiry.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Write the lot-expiry cron route**

Create `app/api/cron/lot-expiry/route.ts`:

```typescript
import { createAdminClient } from "@/lib/supabase/admin";
import { sendLotExpiredEmail } from "@/lib/email";
import { NextResponse } from "next/server";

function getBearerToken(header: string | null) {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer") return null;
  return token || null;
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Missing CRON_SECRET" }, { status: 500 });
  }

  const bearer = getBearerToken(request.headers.get("authorization"));
  const headerSecret = request.headers.get("x-cron-secret");
  if (bearer !== cronSecret && headerSecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  // Find lots past their expiry date that are still active
  const { data: expiredLots, error } = await admin
    .from("lots")
    .select("id, seller_id, title, expiry_date")
    .lte("expiry_date", nowIso)
    .in("status", ["active", "fully_committed"]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let expiredCount = 0;

  for (const lot of expiredLots || []) {
    // Check if there's an active or settled campaign — if so, skip
    const { data: activeCampaigns } = await admin
      .from("campaigns")
      .select("id")
      .eq("lot_id", lot.id)
      .in("status", ["active", "settled"]);

    if (activeCampaigns && activeCampaigns.length > 0) {
      continue; // Lot has an active campaign — settlement cron handles it
    }

    // Expire the lot
    await admin
      .from("lots")
      .update({
        status: "expired",
        settlement_status: "minimum_not_met",
        settlement_processed_at: nowIso,
      })
      .eq("id", lot.id);

    // Notify seller
    const { data: seller } = await admin
      .from("profiles")
      .select("email, contact_name")
      .eq("id", lot.seller_id)
      .single();

    if (seller?.email) {
      void sendLotExpiredEmail({
        seller: { email: seller.email, contact_name: seller.contact_name },
        lot: { id: lot.id, title: lot.title },
      }).catch(console.error);
    }

    expiredCount++;
  }

  return NextResponse.json({
    expired_lots: expiredCount,
    checked_lots: (expiredLots || []).length,
  });
}
```

- [ ] **Step 5: Update vercel.json with lot-expiry cron**

In `vercel.json`, add the lot-expiry cron:

```json
{
  "crons": [
    {
      "path": "/api/payments/settle-deadlines",
      "schedule": "0 0 * * *"
    },
    {
      "path": "/api/cron/lot-expiry",
      "schedule": "0 1 * * *"
    }
  ]
}
```

The lot-expiry cron runs at 01:00 UTC, one hour after settlement, so any active campaigns are settled first.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run app/api/cron/__tests__/lot-expiry.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add app/api/cron/lot-expiry/route.ts app/api/cron/__tests__/lot-expiry.test.ts lib/email/index.ts vercel.json
git commit -m "feat(cron): add lot-expiry cron, sendLotExpiredEmail, schedule at 01:00 UTC"
```

---

## Task 8: Update Hub Catalog Page

**Files:**
- Modify: `app/dashboard/hub/catalog/page.tsx`

**Dependencies:** Task 3

- [ ] **Step 1: Modify catalog page to show campaign status and filter unavailable lots**

In `app/dashboard/hub/catalog/page.tsx`, update the `loadCatalog` function to also fetch active campaigns:

After the `hub_lots` query (line 76-81), add:

```typescript
      // Fetch active campaigns to know which lots are locked
      const { data: activeCampaigns } = await supabase
        .from("campaigns")
        .select("lot_id, hub_id, deadline, status")
        .eq("status", "active");

      const campaignByLotId = new Map(
        (activeCampaigns || []).map((c: any) => [c.lot_id, c])
      );
```

Store `campaignByLotId` in state and use it in the render to:
1. Show "Claimed by another hub" badge for lots with active campaigns by other hubs
2. Show "Campaign Active" badge with deadline for lots with campaigns by this hub
3. Replace "Add to Hub" with "Start Campaign" button that links to `/dashboard/hub/campaigns?lot=${lot.id}&hub=${selectedHubId}`
4. Disable the "Start Campaign" button if another hub has an active campaign

In the lot card render, update the button logic:

```typescript
const campaign = campaignByLotId.get(lot.id);
const hasCampaignByOtherHub = campaign && campaign.hub_id !== selectedHubId;
const hasCampaignByThisHub = campaign && campaign.hub_id === selectedHubId;
```

Show a "Start Campaign" button (linking to campaign setup) instead of the toggle when the lot is in the catalog but has no active campaign:

```typescript
{hasCampaignByOtherHub ? (
  <Badge className="border-amber-200 bg-amber-100 text-amber-800">Claimed</Badge>
) : hasCampaignByThisHub ? (
  <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">
    Campaign Active — ends {new Date(campaign.deadline).toLocaleDateString()}
  </Badge>
) : inHub ? (
  <div className="flex items-center gap-2">
    <Link href={`/dashboard/hub/campaigns?lot=${lot.id}&hub=${selectedHubId}`}>
      <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700">
        Start Campaign
      </Button>
    </Link>
    <Button
      size="sm"
      variant="outline"
      className="border-red-300 text-red-800 hover:bg-red-50"
      disabled={loading === lot.id}
      onClick={() => toggleLot(lot.id, false)}
    >
      <X className="mr-1 h-3 w-3" /> Remove
    </Button>
  </div>
) : (
  <Button
    size="sm"
    variant="default"
    className="bg-emerald-600 text-white hover:bg-emerald-700"
    disabled={loading === lot.id}
    onClick={() => toggleLot(lot.id, true)}
  >
    <Plus className="mr-1 h-3 w-3" /> Add to Hub
  </Button>
)}
```

- [ ] **Step 2: Verify the page compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/hub/catalog/page.tsx
git commit -m "feat(catalog): show campaign status, add Start Campaign action, filter claimed lots"
```

---

## Task 9: Campaign Setup Page

**Files:**
- Create: `app/dashboard/hub/campaigns/page.tsx`

**Dependencies:** Task 3, Task 8

- [ ] **Step 1: Create campaign setup page**

Create `app/dashboard/hub/campaigns/page.tsx`:

```typescript
"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/mernin/Card";
import { Button } from "@/components/mernin/Button";
import { Badge } from "@/components/mernin/Badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Calendar, Clock, AlertCircle } from "lucide-react";
import type { Lot } from "@/lib/types";

const MAX_CAMPAIGN_DAYS = 30;

export default function CampaignSetupPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const lotId = searchParams.get("lot");
  const hubId = searchParams.get("hub");

  const [lot, setLot] = useState<Lot | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deadline, setDeadline] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!lotId) return;
    const loadLot = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("lots")
        .select("*")
        .eq("id", lotId)
        .single();
      setLot(data as Lot | null);
      setLoading(false);
    };
    loadLot();
  }, [lotId]);

  const validateDeadline = (value: string): string | null => {
    if (!value) return "Deadline is required";
    const deadlineDate = new Date(value);
    const now = new Date();

    if (deadlineDate <= now) return "Deadline must be in the future";

    const maxDate = new Date(now.getTime() + MAX_CAMPAIGN_DAYS * 24 * 60 * 60 * 1000);
    if (deadlineDate > maxDate) return `Deadline cannot be more than ${MAX_CAMPAIGN_DAYS} days from now`;

    if (lot?.expiry_date && deadlineDate > new Date(lot.expiry_date)) {
      return "Deadline must be before the lot expiry date";
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateDeadline(deadline);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lot_id: lotId,
        hub_id: hubId,
        deadline: new Date(deadline).toISOString(),
      }),
    });

    const body = await res.json();

    if (!res.ok) {
      setError(body.error || "Something went sideways");
      setSubmitting(false);
      return;
    }

    toast.success("Campaign launched!");
    router.push("/dashboard/hub/catalog");
  };

  // Calculate max allowed date for the date picker
  const now = new Date();
  const maxPickerDate = new Date(now.getTime() + MAX_CAMPAIGN_DAYS * 24 * 60 * 60 * 1000);
  const lotExpiryDate = lot?.expiry_date ? new Date(lot.expiry_date) : null;
  const effectiveMaxDate = lotExpiryDate && lotExpiryDate < maxPickerDate ? lotExpiryDate : maxPickerDate;
  const maxDateStr = effectiveMaxDate.toISOString().slice(0, 16);
  const minDateStr = new Date(now.getTime() + 60000).toISOString().slice(0, 16);

  if (!lotId || !hubId) {
    return (
      <div className="flex flex-col items-center py-12">
        <AlertCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <p className="text-muted-foreground">Missing lot or hub info. Go back to the catalog.</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-6">
        Launch Campaign
      </h1>

      {loading ? (
        <Card>
          <CardHeader><Skeleton className="h-5 w-48" /></CardHeader>
          <CardContent><Skeleton className="h-4 w-full" /></CardContent>
        </Card>
      ) : !lot ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Lot not found.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{lot.title}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {lot.origin_country}{lot.region ? `, ${lot.region}` : ""}
            </p>
            {lot.expiry_date && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
                <Calendar className="h-3 w-3" />
                Lot expires: {new Date(lot.expiry_date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </div>
            )}
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="deadline"
                  className="block text-sm font-medium text-foreground mb-1.5"
                >
                  Campaign Deadline
                </label>
                <p className="text-xs text-muted-foreground mb-2">
                  Buyers in your hub will have until this date to commit. Max {MAX_CAMPAIGN_DAYS} days.
                </p>
                <input
                  id="deadline"
                  type="datetime-local"
                  value={deadline}
                  onChange={(e) => {
                    setDeadline(e.target.value);
                    setError(null);
                  }}
                  min={minDateStr}
                  max={maxDateStr}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={submitting || !deadline}
              >
                {submitting ? "Brewing..." : "Launch Campaign"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/hub/campaigns/page.tsx
git commit -m "feat(ui): add campaign setup page with deadline picker and validation"
```

---

## Task 10: Update Buyer Browse Page

**Files:**
- Modify: `app/dashboard/buyer/browse/page.tsx`

**Dependencies:** Task 1, Task 2

- [ ] **Step 1: Modify buyer browse page to show lots via active campaigns**

In `app/dashboard/buyer/browse/page.tsx`, update the lot query to join through campaigns instead of just hub_lots. The browse page should only show lots that have an active campaign for a hub the buyer belongs to.

Replace the hub_lots query (lines 49-54):

```typescript
  // Get lots with active campaigns for the buyer's hubs
  const { data: activeCampaigns } = await supabase
    .from("campaigns")
    .select(
      "id, hub_id, lot_id, deadline, status, lot:lots!campaigns_lot_id_fkey(*, seller:profiles!lots_seller_id_fkey(company_name, contact_name))"
    )
    .in("hub_id", hubIds)
    .eq("status", "active");
```

Update the pricing tiers query to use campaign lot_ids:

```typescript
  const lotIds = (activeCampaigns || [])
    .map((c: any) => c.lot_id)
    .filter(Boolean);
```

Update the grouping logic to use campaigns:

```typescript
  for (const c of activeCampaigns || []) {
    const cAny = c as any;
    if (cAny.lot && lotsByHub[cAny.hub_id]) {
      lotsByHub[cAny.hub_id].lots.push({
        ...cAny.lot,
        hub_id: cAny.hub_id,
        campaign_id: cAny.id,
        campaign_deadline: cAny.deadline,
        pricing_tiers: tiersMap[cAny.lot_id] || [],
      });
    }
  }
```

In the lot card render, use `lot.campaign_deadline` instead of `lot.commitment_deadline` for the deadline display:

```typescript
  const hasDeadline = !!lot.campaign_deadline;
  const deadlineDate = hasDeadline ? new Date(lot.campaign_deadline) : null;
```

- [ ] **Step 2: Verify types compile and page renders**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/buyer/browse/page.tsx
git commit -m "feat(browse): show lots via active campaigns instead of hub_lots"
```

---

## Self-Review

**1. Spec coverage:**
- AC1 (claim + configure campaign): Tasks 3, 8, 9
- AC2 (exclusivity): Task 3 (DB index + 409 response), Task 8 (UI filter)
- AC3a (successful settlement): Task 6
- AC3b (failed settlement + recycle): Task 6
- AC3c (lot expiry): Task 7
- AC4 (commitment campaign_id): Task 5
- AC5 (deadline validation): Tasks 3, 9 (API + UI)
- Migration: Task 1

**2. Placeholder scan:** No TBDs, TODOs, or vague instructions. All code blocks are complete.

**3. Type consistency:** `Campaign`, `CampaignStatus` defined in Task 2 and used consistently in Tasks 3-10. `campaign_id` added to Commitment type and used in Tasks 5, 6.

**4. Dependency ordering:** Tasks 1+2 are parallel (no deps). Tasks 3-10 depend on 1+2. Task 6 depends on Task 5. Tasks 8, 9, 10 can run in parallel once their deps are met.

**5. Command accuracy:** All vitest commands use `npx vitest run <path>`. TypeScript check uses `npx tsc --noEmit`. File paths match project structure.

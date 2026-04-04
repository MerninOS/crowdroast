# Spec: Exclusive Lot Campaigns

Date: 2026-04-03

## Feature Summary

Our current flow allows multiple hubs to list the same lot on their catalog. This breaks settlement because the 2% hub payout splits to all hubs even when one hub drove the majority of sales. It also breaks physical fulfillment — orders ship to a single hub location, so district city-based hubs listing the same lot creates a logistics conflict. This feature introduces exclusive lot assignment: only one hub can run a campaign on a lot at a time. Sellers set a lot expiry date controlling how long their coffee is available. Hub owners claim available lots and set a campaign deadline (max 30 days, before lot expiry) during which their buyers can commit. If a campaign fails to meet the minimum, the lot recycles back to the marketplace for another hub to claim. If no hub succeeds before the lot expires, the seller is notified. A new campaigns table tracks each hub's attempt with DB-enforced exclusivity via a partial unique index.

## Acceptance Criteria

1. Given a hub owner on the lot catalog page, when they claim an available lot, they will configure a campaign (set deadline up to 30 days, before lot expiry). Lots with an active campaign will be listed for buyers on the browse page.
2. Given a lot with an active campaign, when another hub owner views the catalog, that lot will not appear as available. In a race condition, the second claim will fail with "This lot has already been claimed."
3a. Given an active campaign whose deadline has passed and committed quantity meets the lot minimum, when settlement runs, then the seller, hub owner, and platform will receive their respective payouts (same split as today), the campaign status will be set to `settled`, and the lot status will be set to `closed`.
3b. Given an active campaign whose deadline has passed and committed quantity does NOT meet the lot minimum, when settlement runs, then all buyer payments will be refunded, the campaign status will be set to `failed`, and if the lot has not expired, the lot will reappear in the catalog as available for other hubs to claim.
3c. Given a lot whose expiry date has passed with no successful campaign, when the lot expiry check runs, then the lot status will be set to `expired`, the lot will be closed, and the seller will receive an email notifying them to consider re-listing or adjusting terms.
4. Given an active campaign, when a buyer commits to the lot, the commitment will be tied to the `campaign_id`. The rest of the commitment flow remains unchanged.
5. Given a hub owner configuring a campaign, when they set a deadline beyond 30 days or past the lot expiry, they will see an error and will not be allowed to create the campaign.

## Non-Goals

- Seller approval of which hubs can claim their lots (open claim model, no gatekeeping)
- Hub owners extending or modifying a campaign deadline after it is set
- Campaign history analytics or reporting
- Partial settlement within a campaign (all-or-nothing, same as today)
- Seller-defined min/max campaign length constraints

## Test Spec

### Criterion 1: Hub owner claims lot and configures campaign
- Happy path: Lot is claimable, hub owner configures campaign with valid deadline, lot appears on buyer browse page for that hub.
- Failure path: Lot is added to catalog but does not appear in campaigns the hub owner can configure.
- False positive check: Lot shows on browse page due to old `hub_lots` logic rather than an active campaign record. Test must verify a campaign record exists with status `active`.

### Criterion 2: Exclusivity enforcement
- Happy path: Once a lot has an active campaign, it does not appear as available on other hubs' catalog pages.
- Failure path: Lot still shows as available due to stale data or missing filter.
- False positive check: Test only uses one hub and never verifies a second hub is actually blocked. Test must involve two hubs attempting to claim the same lot.

### Criterion 3a: Successful settlement
- Happy path: Settlement cron triggers, payouts flow to seller (net), hub owner (2%), and platform (remainder). Campaign status set to `settled`, lot status set to `closed`.
- Failure path: One or all payout mechanisms fail during Stripe transfer.
- False positive check: Payouts are recorded as successful in the DB but an error on the Stripe side prevents the actual transfer from completing. Test must verify Stripe transfer IDs are valid.

### Criterion 3b: Failed settlement / lot recycle
- Happy path: Minimum not met, buyers refunded, campaign set to `failed`, lot reappears on catalog for other hubs to claim.
- Failure path: Lot does not reappear for other hubs after campaign failure.
- False positive check: Lot shows as available but its expiry date has already passed. Test must verify lot expiry has not been reached when asserting recyclability.

### Criterion 3c: Lot expiry with no successful campaign
- Happy path: Lot expiry passes, lot status set to `expired`, lot closed, seller receives email notification.
- Failure path: Lot doesn't settle and seller is not notified.
- False positive check: Seller is notified of a failed lot even when a campaign was actually successful. Test must verify no successful campaign exists before sending the expiry email.

### Criterion 4: Buyer commitment tied to campaign_id
- Happy path: Buyer commits to a lot with an active campaign. Commitment record stores the correct `campaign_id`. Settlement uses `campaign_id` to resolve commitments.
- Failure path: Buyer tries to commit but the campaign has expired or been cancelled. System rejects the commitment.
- False positive check: Test passes because `hub_id` is correct but `campaign_id` is null or wrong. Would break with multiple campaign attempts on the same lot. Test must verify `campaign_id` is populated and correct.

### Criterion 5: Campaign deadline validation
- Happy path: Hub owner tries to set deadline past 30 days or past lot expiry, form shows error, campaign is not created.
- Failure path: Hub owner is able to set a deadline longer than 30 days.
- False positive check: Client-side form validation blocks it, but API does not validate. Someone could bypass the UI and POST directly with an invalid deadline. Test must verify both UI and API-level validation.

## Architecture Sketch

### New Files

| File | Purpose |
|------|---------|
| `scripts/XXX_campaigns.sql` | Migration: create campaigns table, add expiry_date to lots, add campaign_id to commitments |
| `app/api/campaigns/route.ts` | POST: hub owner creates a campaign (claims lot, sets deadline) |
| `app/api/campaigns/[id]/route.ts` | PATCH: cancel a campaign. GET: fetch campaign details |
| `app/dashboard/hub/campaigns/page.tsx` | UI: hub owner configures and launches a campaign |
| `app/api/cron/lot-expiry/route.ts` | Cron: finds expired lots with no successful campaign, marks expired, emails seller |

### Changed Files

| File | What Changes |
|------|-------------|
| `app/api/payments/settle-deadlines/route.ts` | Query campaigns (not lots) by deadline. On success: campaign=settled, lot=closed. On failure: campaign=failed, lot stays active if not expired. |
| `app/api/commitments/route.ts` | Accept and store `campaign_id`. Validate campaign is active and deadline hasn't passed. |
| `app/dashboard/hub/catalog/page.tsx` | Show lots with active campaigns by other hubs as unavailable. "Start Campaign" action leads to campaign setup. |
| Buyer browse page | Filter lots by active campaigns for the buyer's hub. |
| `lib/types.ts` | Add Campaign type, add expiry_date to Lot, add campaign_id to Commitment. |
| `vercel.json` | Add lot-expiry cron schedule. |

### Data Flow

1. Seller creates lot with `expiry_date`
2. Lot appears on hub catalog page (no active campaign = available)
3. Hub owner clicks "Start Campaign" → campaign setup page
4. Hub owner sets deadline (max 30 days, before expiry) → POST /api/campaigns
5. Campaign record created (status: active). Lot shown as unavailable to other hubs.
6. Lot appears on buyer browse page (via active campaign for their hub)
7. Buyers commit → commitment stores `campaign_id`
8. Campaign deadline passes → settle-deadlines cron picks it up
9a. Minimum met → payout to seller/hub/platform, campaign=settled, lot=closed
9b. Minimum NOT met → refund buyers, campaign=failed
10. If lot not expired → lot reappears on catalog for other hubs
    If lot expired → lot=expired, seller emailed

### Key Database Details

- `campaigns` table with partial unique index: `CREATE UNIQUE INDEX idx_one_active_campaign_per_lot ON campaigns (lot_id) WHERE status = 'active'` — DB-enforced exclusivity
- `hub_lots` remains as a non-exclusive catalog/wishlist. Multiple hubs can add the same lot. Exclusivity only begins when a campaign is created.
- Campaign statuses: `active`, `settled`, `failed`, `cancelled`
- Lot gets new status value: `expired`

## Open Questions

1. Migration strategy: existing data is test data and can be wiped — schema changes only, no data migration needed.
2. `hub_lots` remains as a non-exclusive catalog/wishlist. Multiple hubs can add the same lot. Exclusivity only begins when a campaign is created. Resolved.

# Spec: Seller Commitments Page Redesign

Date: 2026-04-05

## Feature Summary

The seller commitments page on the seller dashboard needs to be redesigned to group commitments by lot rather than presenting them as a flat, unfiltered list. Sellers currently cannot distinguish between commitments tied to active campaigns and those already settled, making it difficult to understand where each lot stands. The new design presents a searchable list of lot cards — each showing campaign status and total committed weight — with failed campaigns hidden entirely. Clicking a lot card navigates to a detail page with a full breakdown of individual commitments for that lot and the seller's projected revenue at the current price tier.

## Acceptance Criteria

1. Given a seller is on the commitments page, when the page loads, then they will see a card for each lot that has at least one active or settled campaign with at least one commitment, sorted by most recent campaign activity.
2. Given a seller is viewing the lot list, when they type in the search field, then the list will filter in real time to show only lots whose name, campaign status label, or hub name matches the search term (case-insensitive).
3. Given a lot card is displayed, then it will show: lot title, hub name, campaign status label (one of: Open / At Risk, Open / Guaranteed, Successful), and total committed weight.
4. Given a campaign has `status = "failed"` or `status = "cancelled"`, then no card for that lot will appear on the commitments page.
5. Given a seller clicks a lot card, then they will be navigated to `/dashboard/seller/commitments/[lotId]`.
6. Given a seller is on a lot detail page, then they will see a list of all non-cancelled commitments on that lot, each row showing: buyer company name, weight committed, and seller amount (seller price only — does not include the 10% platform fee).
7. Given a seller is on a lot detail page, then they will see the current effective price per kg (resolved from pricing tiers against total committed weight, or the base `price_per_kg` if no tiers exist) and the total projected seller revenue.
8. Given the lot detail page is accessed directly via URL with a `lotId` that does not belong to the logged-in seller, then the page will return a 404.

## Non-Goals

- Sellers will not be able to take any action on commitments from either page (read-only).
- No email or notification functionality will be triggered from these pages.
- No export or download functionality.

## Test Spec

### Criterion 1: Lot cards appear only for active/settled campaigns with commitments

- Happy path: Seller has 3 lots — 2 with active campaigns and commitments, 1 with only a failed campaign. Page renders 2 cards.
- Failure path: The failed-campaign lot appears in the list. Test fails if card count does not match.
- False positive check: A lot with both a failed campaign and a separate active campaign should still appear (filtering is per campaign status, not per lot).

### Criterion 2: Search filters in real time

- Happy path: Typing the hub name into the search field reduces the visible cards to only those tied to that hub.
- Failure path: The card list does not update when a search term is entered.
- False positive check: Search is case-insensitive — entering "SINGLE ORIGIN HUB" and "single origin hub" must produce identical results.

### Criterion 3: Lot card displays correct status label

- Happy path: A lot with `campaign.status = "active"` and `committed_quantity_kg >= minimum threshold` shows "Open / Guaranteed."
- Failure path: Card displays wrong status label or is missing hub name.
- False positive check: If `hub` is not joined or hub name is null, the card still renders without crashing.

### Criterion 4: Failed and cancelled campaigns are hidden

- Happy path: A lot whose only campaign is failed shows no card on the page.
- Failure path: Failed lot card appears on page.
- False positive check: Ensure the filter does not accidentally hide active campaigns when a lot has both active and failed campaigns.

### Criterion 5: Clicking a lot card navigates to the detail page

- Happy path: Clicking a card navigates to `/dashboard/seller/commitments/[lotId]` and the detail page loads with commitment data.
- Failure path: Click does nothing, or the route 404s unexpectedly.
- False positive check: Navigating to the detail page for a lot that belongs to a different seller must 404, not expose data.

### Criterion 6: Detail page shows correct per-commitment rows

- Happy path: A lot with 3 commitments shows 3 rows. Each row displays buyer company name, weight committed, and seller amount calculated as `commitment.price_per_kg × commitment.quantity_kg`.
- Failure path: Rows show buyer-facing price (i.e., `commitment.total_price` which includes the 10% platform fee) instead of the seller price.
- False positive check: `total_price` on a commitment may include platform fees — confirm the calculation explicitly uses `price_per_kg × quantity_kg`, not `total_price`.

### Criterion 7: Detail page shows current tier price and projected revenue

- Happy path: Lot has 2 pricing tiers. Total committed weight falls in tier 2. Detail page shows the tier 2 price per kg and projected revenue = tier 2 price × total committed kg.
- Failure path: Page shows wrong tier price or no projected revenue.
- False positive check: If committed weight equals exactly a tier boundary value, define and test which tier applies (e.g., the higher tier).

### Criterion 8: Direct URL access to another seller's lot returns 404

- Happy path: Seller A cannot see Seller B's lot detail page; accessing `/dashboard/seller/commitments/[sellerB-lotId]` returns a 404.
- Failure path: The page renders Seller B's commitment data.
- False positive check: Ensure the auth check is on `lot.seller_id = user.id`, not just that the lot exists.

## Architecture Sketch

### Files changed

| File | Action |
|---|---|
| `app/dashboard/seller/commitments/page.tsx` | Replace — new lot-grouped card list |
| `app/dashboard/seller/commitments/[lotId]/page.tsx` | New — lot commitment detail page |

### Data flow — list page

```
auth: user.id → seller

lots WHERE seller_id = user.id
  JOIN campaigns WHERE status IN ('active', 'settled')
    JOIN hubs (for hub.name)
  JOIN commitments WHERE status != 'cancelled'
    JOIN profiles (buyer company_name)
  JOIN pricing_tiers

→ Group by lot
→ Derive campaign status label per lot (see below)
→ Compute total committed weight per lot
→ Filter: exclude lots where all campaigns are failed/cancelled
→ Render as searchable card list (client component for search state)
```

### Data flow — detail page

```
param: lotId

lot WHERE id = lotId AND seller_id = user.id  ← 404 if not found
  JOIN campaigns
  JOIN commitments WHERE status != 'cancelled'
    JOIN profiles (buyer company_name)
  JOIN pricing_tiers

→ Resolve active pricing tier (see below)
→ Compute projected seller revenue
→ Render commitment rows
```

### Campaign status label logic

```
campaign.status = 'settled'  →  Successful
campaign.status = 'active'
  AND lot.committed_quantity_kg >= lot.total_quantity_kg  →  Open / Guaranteed
  AND lot.committed_quantity_kg < lot.total_quantity_kg   →  Open / At Risk
```

### Pricing tier resolution

```
Sort pricing_tiers by min_quantity_kg ASC
Find highest tier where lot.committed_quantity_kg >= tier.min_quantity_kg
If no tier matched → fall back to lot.price_per_kg
```

## Open Questions

- **Search scope:** Client-side filtering is assumed. If a seller has many lots (50+), confirm that client-side filtering is acceptable performance-wise, or whether server-side filtering with URL query params is preferred.

## Resolved Questions

- **Guaranteed threshold:** A campaign is "Open / Guaranteed" when `lot.committed_quantity_kg >= lot.total_quantity_kg`. This is derived from lot fields, not a campaign-level field.
- **Multiple campaigns per lot:** Only one campaign can be active at a time. The detail page filters commitments to only those belonging to the current active or settled campaign (`campaign_id` match). Failed campaigns and their commitments are hidden entirely.
- **Price per commitment row:** Detail rows show the current active tier price (resolved from total committed weight against pricing tiers), not `commitment.price_per_kg` locked at commit time. All rows use the same current tier price.

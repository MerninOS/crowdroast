# Spec: Guest Browse Lots

Date: 2026-04-02

## Feature Summary

CrowdRoast visitors (unauthenticated users) are currently blocked from seeing any lot or hub content — every route except the landing page requires an account. This is causing sign-up drop-off because potential buyers cannot evaluate the platform's value before committing to creating an account. This feature adds a public `/browse` route where guests can discover hubs and lots, view full lot details (tasting notes, producer info, pricing, commitment progress), and are gated only at the point of action — replacing the purchase UI with a CTA that directs them to create an account.

## Acceptance Criteria

1. Given a guest (not signed in), when they visit `/browse`, then they can see all hubs and their associated lots without being redirected to sign-in.
2. Given a guest, when they click into a lot on the browse page, then they see all lot details (tasting notes, producer info, price, units, commitment progress) identical to what a signed-in buyer sees.
3. Given a guest viewing a lot detail page, when they look at the purchase/commit UI, then instead of the commitment form they see a CTA reading "Request access to this hub to commit" (or equivalent), and the normal purchase button is absent.
4. Given a guest, when they click the gated CTA, then they are directed to `/auth/sign-up` (the create account page).

## Non-Goals

- Guests cannot request hub access directly — that requires an account first.
- Guests do not see personalized data (order history, hub memberships, etc.).
- Hub owners are not notified when a guest views their lot.
- Guest browse behavior is not tracked or stored.

## Test Spec

### Criterion 1: Guest can browse hubs and lots without sign-in redirect

- **Happy path:** A request to `/browse` with no session cookie returns a 200 with hub and lot data rendered in the page body.
- **Failure path:** The page redirects to `/auth/login` or renders with no hub/lot data present.
- **False positive check:** The test must assert that hub and lot content is actually present in the rendered output — not just that the page returns 200. A page that renders an empty state would also return 200.

### Criterion 2: Lot detail page shows all data to a guest

- **Happy path:** A request to `/browse/[id]` with no session returns a 200 with tasting notes, producer info, price, and units rendered.
- **Failure path:** Any of the data fields (tasting notes, producer info, price, units) are empty or missing from the rendered output.
- **False positive check:** The test must assert each specific field is present and non-empty — not just that the page renders. A page with blank fields would still pass a render-only check.

### Criterion 3: Purchase button is absent; gated CTA is present

- **Happy path:** A guest viewing a lot detail page sees the gated CTA text and does not see the commitment form or purchase button.
- **Failure path:** The purchase/commitment form is visible to a guest.
- **False positive check:** The test must assert the purchase button/commitment form is absent — not just that the CTA text is present. Both could render simultaneously if the condition is wrong (e.g., CSS hide vs. conditional render).

### Criterion 4: Gated CTA directs guest to create account page

- **Happy path:** Clicking the gated CTA navigates the guest to `/auth/sign-up`.
- **Failure path:** The guest is taken to `/auth/login` or a purchase flow instead of the create account page.
- **False positive check:** The test must assert the destination is specifically `/auth/sign-up` — not just that a redirect occurred. A redirect to `/auth/login` would also pass a redirect-only assertion.

## Architecture Sketch

**No middleware changes required.** The existing middleware only gates `/dashboard` and `/protected`. A `/browse` route is already public.

**New files:**
- `app/browse/page.tsx` — Public browse page. Queries all `hub_lots` joined to `lots` and `hubs` with no membership filter. Styled using the Mernin' design system (same as landing page). Links to `/browse/[id]`.
- `app/browse/[id]/page.tsx` — Public lot detail page. Fetches lot, pricing tiers, and commitments by lot ID (no auth check, no membership verification). Passes `userId={null}` to `LotDetailView`.

**Modified files:**
- `components/lot-detail-view.tsx` — The `!userId` branch (lines 601–604) currently renders "Sign in to commit" linking to `/auth/login`. Change button text to "Request access to this hub to commit" and update link to `/auth/sign-up`.
- `app/marketplace/page.tsx` — Update redirect from `/dashboard` to `/browse`.

**Data flow:**
```
Guest → /browse
  → app/browse/page.tsx
  → Supabase: SELECT hub_lots JOIN lots JOIN hubs (no user filter)
  → Renders hub groups with lot cards

Guest → /browse/[id]
  → app/browse/[id]/page.tsx
  → Supabase: SELECT lots, pricing_tiers, commitments by lot ID
  → LotDetailView with userId=null
  → Renders full lot detail; shows gated CTA instead of CommitmentForm

Guest clicks CTA → /auth/sign-up
```

## Open Questions

- **Lot visibility assumption:** All lots in the database are treated as public once added to a hub. There is currently no concept of a private or draft lot. If draft lots are added in the future, the browse query will need a status filter.
- **Hub visibility assumption:** All hub names are public. No hubs have opted out of public visibility.

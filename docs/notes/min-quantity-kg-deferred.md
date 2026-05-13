# Deferred follow-up: drop `pricing_tiers.min_quantity_kg`

> Status as of Task 4.16 of `bag-aware-campaign-close`.
> Decision: **DEFER.** Do NOT write the drop migration yet.
> Source: investigation run against branch `zdebrine/crowdroast-bag-aware-campaign-close`.

---

## TL;DR

The plan's gate for Task 4.16 is "Grep first to confirm no remaining readers."
There are **many** remaining production readers — including the two pricing
resolvers used by money-moving codepaths (`getFinalPricePerKg` and
`resolveTierPrice`). Dropping the column today would:

1. Break the legacy (kg-keyed) settle-deadlines path for any lot whose tiers
   were written before the Stage 1–3 cutover (`min_quantity_kg NOT NULL`,
   `min_bags NULL`).
2. Break every browse / lot-detail / commitment-drawer surface that renders
   the tier ladder from `min_quantity_kg`.
3. Break the seller's edit form and the bag-config backfill UI, which use
   `min_quantity_kg` as the user-visible threshold input.

The column is **deprecated**, but it is not yet **dead**. Treat this as a
proper deprecation cycle, not a one-shot drop.

---

## Remaining readers

### Category A — Money/settlement code (the blockers)

These read `min_quantity_kg` to resolve the per-kg price that ends up on
Stripe charges and transfers. They MUST be migrated to `min_bags` (with a
documented fallback for legacy lots that have neither) before the column
can be dropped.

- `lib/payments/settlement-logic.js:48-62` — `getFinalPricePerKg(base, kg, tiers)`.
  Sorts tiers by `min_quantity_kg` desc, picks the largest threshold ≤ committed kg.
  Consumed by the legacy branch in `app/api/payments/settle-deadlines/route.ts`.
- `lib/payments/settlement-logic.test.js:31-40` — fixture rows for the
  helper above; will move when the helper moves.
- `lib/bag-transfer-out.ts:130, 314, 533-548` — `resolveTierPrice` mirror
  of the helper above, used to derive the seller's base (pre-fee) price
  for transfer splits. Same algorithm, same column.
- `app/api/payments/settle-deadlines/route.ts:642-645` — loads
  `min_quantity_kg, min_bags, price_per_kg` for every settling lot. The
  bag-aware branch already passes the rows to `computeCompletedBagsAndPrice`
  (which uses `min_bags`); the legacy branch still feeds them to
  `getFinalPricePerKg`.
- `app/api/commitments/route.ts:114-123` — orders by `min_quantity_kg` and
  evaluates `newTotal >= tier.min_quantity_kg` to set
  `payment_status = 'authorized'` at commit time. Hot path.
- `app/api/cron/price-drops/route.ts:71-73` — daily cron evaluates which
  buyers should be notified of a tier drop; reads `min_quantity_kg`.

### Category B — Server-rendered pages and dashboard readers

These hit the DB directly and would 500 if the column disappeared.

- `app/api/lots/[id]/route.ts:92, 280-282` — GET returns tiers ordered by
  and shaped with `min_quantity_kg`.
- `app/api/lots/route.ts:30, 39, 220, 339, 347` — POST handler. Already
  writes `min_quantity_kg: null` for new tiers (Stage 3), but still
  references the column in the input shape and the DB row construction.
- `app/browse/[id]/page.tsx:37` and `app/browse/page.tsx:39, 141-144` —
  public browse listing reads tier ladders.
- `app/dashboard/buyer/browse/page.tsx:67, 156-159`,
  `app/dashboard/buyer/commitments/page.tsx:170-181`,
  `app/dashboard/buyer/lot/[id]/page.tsx:76`,
  `app/dashboard/buyer/page.tsx:131-221`,
  `app/dashboard/hub/catalog/[id]/page.tsx:58`,
  `app/dashboard/seller/commitments/[lotId]/page.tsx:12-87`,
  `app/dashboard/seller/commitments/page.tsx:7-71` — every commitments/
  catalog/dashboard page selects, orders, and renders tiers by `min_quantity_kg`.

### Category C — Seller form surfaces

These build the user-facing tier ladder UI in kg units.

- `app/dashboard/seller/lots/[id]/edit/page.tsx:34, 122-210, 554-576` —
  seller's "edit lot" form is still keyed on a `min_quantity_kg` string
  input. (The "new lot" form was migrated to bags in Stage 3.)
- `app/dashboard/seller/lots/[id]/backfill-bag-config/page.tsx:96-150`
  and `.../backfill-bag-config-form.tsx:26, 113, 423, 461` — the backfill
  UI literally exists to show the legacy `min_quantity_kg` value so the
  seller can choose a `min_bags` for it. **This UI requires the column
  to stay until every legacy lot has been backfilled.**
- `app/dashboard/seller/lots/new/create-lot-form.tsx:32-33, 214` — only
  comments now; the form already writes via `min_bags`. Safe to update
  comments at drop time but not a blocker.

### Category D — Components

UI consumers of the tier shape; will need their prop types updated when
the type changes.

- `components/buyer-commitments/buyer-commitments-board.tsx:14, 96-98`
- `components/buyer-commitments/commitment-drawer/closed-body.tsx:15, 101-159`
- `components/buyer-commitments/commitment-drawer/raising-body.tsx:12-13, 56-126`
- `components/buyer-commitments/raising-lot-card.tsx:16-17, 61-148`
- `components/campaign/CampaignPage.tsx:543, 563`
- `components/featured-roast-hero.tsx:12, 25-27`
- `components/lot-detail-view.tsx:79-92, 100-110, 329-429`

### Category E — Type / contract

- `lib/types.ts:242` — `PricingTier.min_quantity_kg: number`. Once every
  Category A–D reader is migrated, this becomes `min_quantity_kg?: number`
  (or is removed entirely in lockstep with the migration).

### Category F — Test fixtures + scripts

Mechanical updates; not blockers.

- `components/buyer-commitments/commitment-drawer/__tests__/closed-body.test.tsx:150-227`
- `components/buyer-commitments/commitment-drawer/__tests__/raising-body.test.tsx:131-177`
- `components/campaign/__tests__/test-helpers.tsx:47-48`
- `lib/payments/settlement-logic.test.js:31-40`
- `lib/__tests__/settle-bag-pricing.test.ts:94` — comment only
- `scripts/seed-test-env.ts:183-231` — seeds `min_quantity_kg`; needs to
  seed `min_bags` instead once the column is gone.

---

## Data-state assumption required to drop safely

Before the drop migration is safe, **all** of the following must hold:

1. **Every row** in `pricing_tiers` has `min_bags IS NOT NULL`. Spot-check
   in production:
   ```sql
   select count(*) from public.pricing_tiers where min_bags is null;
   -- must be 0
   ```
   Stage 3 made new tier rows write `min_bags`. Existing pre-cutover tiers
   still have `min_quantity_kg` only — those have to be backfilled (via
   the Stage 3 backfill UI at
   `/dashboard/seller/lots/[id]/backfill-bag-config` or a bulk admin
   action) before the column can go.

2. **Every lot** referenced by remaining tiers has a non-null
   `bag_size_kg`. Without it, `min_bags` is meaningless:
   ```sql
   select count(*)
   from public.pricing_tiers t
   join public.lots l on l.id = t.lot_id
   where l.bag_size_kg is null;
   -- must be 0
   ```

3. Every Category A reader has been re-pointed at `min_bags` (with the
   completed-bag count computed from `floor(committed_kg / bag_size_kg)`).
   `lib/settle-bag-pricing.ts:computeCompletedBagsAndPrice` is the
   canonical replacement for `getFinalPricePerKg` — extend it (or write a
   sibling helper) so non-settlement callers can use it too.

---

## Recommended sequence (a future plan item, not this task)

1. **Backfill.** Add a one-shot admin script or a migration with a
   `UPDATE pricing_tiers SET min_bags = ceil(min_quantity_kg / l.bag_size_kg)`
   for every lot that already has `bag_size_kg`. For lots without
   `bag_size_kg`, force the seller through the existing backfill UI or
   archive the lot. Verify `count(*) where min_bags is null` is 0 before
   proceeding.
2. **Migrate Category A.** Replace `getFinalPricePerKg` and
   `resolveTierPrice` with calls that read `min_bags` + the lot's
   `bag_size_kg` + the lot's `committed_quantity_kg`. Settle-deadlines
   legacy branch goes away; everything routes through
   `computeCompletedBagsAndPrice` (or its kg-fallback sibling).
3. **Migrate Categories B, C, D.** Update server queries to select
   `min_bags` and render bag counts. The edit form rewrites to take bag
   input (mirroring the new-lot form). Re-derive any kg display from
   `min_bags * bag_size_kg`.
4. **Re-grep.** Confirm zero non-migration `.ts`/`.tsx`/`.js` matches for
   `min_quantity_kg`.
5. **Drop.** Write
   `supabase/migrations/<next>_drop_pricing_tiers_min_quantity_kg.sql`
   with `ALTER TABLE pricing_tiers DROP COLUMN min_quantity_kg;`. Remove
   the field from `PricingTier` in `lib/types.ts`. Update remaining
   test fixtures and `scripts/seed-test-env.ts`.
6. **Verify.** `supabase db reset`, `tsc --noEmit`, full vitest suite,
   and the e2e bag-aware lifecycle test must all stay green.

This is meaningful Stage 5 / cleanup work — at minimum a backfill task
and a re-render task per surface. It should not piggyback on the
bag-aware-campaign-close plan's Stage 4 close-out.

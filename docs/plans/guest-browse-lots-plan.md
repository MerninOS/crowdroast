# Plan: Guest Browse Lots

> **Spec:** specs/guest-browse-lots.md
> **Date:** 2026-04-02

## Overview

Add public `/browse` and `/browse/[id]` routes so unauthenticated visitors can discover hubs and lots without signing in. The purchase CTA is replaced with a "Request access to this hub to commit" button linking to `/auth/sign-up`.

---

## Tasks

### Task 1: Update LotDetailView unauthenticated CTA

**Files:** `components/lot-detail-view.tsx`
**blockedBy:** none

In `lot-detail-view.tsx`, lines 601–604, the `!userId` branch renders:
```tsx
<Button asChild className="w-full">
  <Link href="/auth/login">Sign in to commit</Link>
</Button>
```

Change the button text to "Request access to this hub to commit" and update the link href from `/auth/login` to `/auth/sign-up`. Apply Mernin' button styling (`btn-primary` equivalent: tomato background, espresso border, flat shadow, pill radius).

---

### Task 2: Create public browse page

**Files:** `app/browse/page.tsx`
**blockedBy:** none

Create a new Next.js server component at `app/browse/page.tsx`. No auth check — this is fully public.

Data fetching:
- Query `hub_lots` joined to `lots` (with seller info) and `hubs` — no user/membership filter
- Query `pricing_tiers` for all lot IDs
- Only show lots with `status = 'active'`
- Group lots by hub

UI: Styled with the Mernin' design system (same aesthetic as the landing page):
- Cream background, espresso text
- Adore Cats font for hero headline
- Cal Sans for body/UI
- Lot cards: comic-book panel style (5px espresso border, flat offset shadow, `--radius-lg` corners)
- Marquee bar at top (tomato background, scrolling text)
- Links to `/browse/[id]` for each lot

---

### Task 3: Create public lot detail page

**Files:** `app/browse/[id]/page.tsx`
**blockedBy:** Task 1

Create a new Next.js server component at `app/browse/[id]/page.tsx`. No auth check — fully public.

Data fetching (same as existing `/dashboard/buyer/lot/[id]` page, minus auth and membership checks):
- Fetch lot by ID with seller info
- Fetch pricing tiers
- Fetch commitments (for backers list)
- If lot not found, call `notFound()`

Render: Pass `userId={null}`, `hubId={null}`, `viewerRole="buyer"` to `LotDetailView`. This will show the updated gated CTA from Task 1 instead of the commitment form.

Back link should point to `/browse`.

---

### Task 4: Update marketplace redirect

**Files:** `app/marketplace/page.tsx`
**blockedBy:** none

Change the redirect in `app/marketplace/page.tsx` from `/dashboard` to `/browse`.

```tsx
// Before
redirect("/dashboard");

// After
redirect("/browse");
```

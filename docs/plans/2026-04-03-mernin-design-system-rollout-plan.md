# Plan: Mernin Design System Rollout

> **Spec:** specs/mernin-design-system-rollout.md
> **For Claude:** Use `build` to execute this plan.

---

## Stage 1: Foundation (CSS variables + layout)

### Task 1.1 — Update globals.css CSS variables to Mernin palette
- **Modify:** `app/globals.css`
- **What:** Replace shadcn HSL variables with Mernin color equivalents (cream background, espresso foreground, tomato primary, espresso borders, etc.)
- **Verify:** `npm run build` passes, existing pages still render
- **Commit:** `style: update CSS variables to Mernin color palette`

### Task 1.2 — Restyle DashboardShell
- **Modify:** `components/dashboard-shell.tsx`
- **What:** Cream backgrounds, espresso borders (3px+), Mernin typography on role labels and nav, sidebar styling to match brand
- **Verify:** Dashboard layout renders with cream bg, Mernin fonts, thick borders
- **Commit:** `style: restyle DashboardShell with Mernin design system`

---

## Stage 2: Build Mernin components

### Task 2.1 — Create Mernin Card
- **Create:** `components/mernin/Card.tsx`
- **What:** Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter — 5px espresso border, flat offset shadow, chalk background, hover lift effect. 1:1 API match with shadcn Card.
- **Verify:** Import in one page, renders correctly
- **Commit:** `feat: add Mernin Card component`

### Task 2.2 — Create Mernin Button
- **Create:** `components/mernin/Button.tsx`
- **What:** Primary (stamp-press pill, tomato bg), outline (espresso border pill), destructive, ghost, link variants. Same props as shadcn (asChild, variant, size).
- **Verify:** All variants render, click handlers work
- **Commit:** `feat: add Mernin Button component`

### Task 2.3 — Create Mernin Badge
- **Create:** `components/mernin/Badge.tsx`
- **What:** Thick 2px espresso border, pill shape, Mernin color variants (default, secondary, destructive, outline).
- **Verify:** All variants render with correct colors
- **Commit:** `feat: add Mernin Badge component`

### Task 2.4 — Create Mernin Input
- **Create:** `components/mernin/Input.tsx`
- **What:** 3px espresso border, flat shadow, rounded-md, tomato focus ring. Same props as shadcn Input.
- **Verify:** Focus state shows tomato ring, shadow shifts
- **Commit:** `feat: add Mernin Input component`

---

## Stage 3: Dashboard page migration

### Task 3.1 — Swap imports on buyer dashboard pages
- **Modify:** `app/dashboard/buyer/page.tsx`, `buyer/commitments/page.tsx`, `buyer/claims/page.tsx`, `buyer/cuppings/page.tsx`, `buyer/browse/page.tsx`, `buyer/access-request/page.tsx`
- **What:** Replace `@/components/ui/card` → `@/components/mernin/Card`, same for button, badge, input
- **Blocked by:** 2.1–2.4
- **Verify:** All buyer pages render with Mernin components, functionality intact
- **Commit:** `style: migrate buyer dashboard to Mernin components`

### Task 3.2 — Swap imports on seller dashboard pages
- **Modify:** `app/dashboard/seller/page.tsx`, `seller/lots/page.tsx`, `seller/lots/new/page.tsx`, `seller/lots/[id]/edit/page.tsx`, `seller/commitments/page.tsx`, `seller/samples/page.tsx`, `seller/payouts/page.tsx`, `seller/shipments/page.tsx`
- **What:** Same import swaps
- **Blocked by:** 2.1–2.4
- **Verify:** All seller pages render with Mernin components, functionality intact
- **Commit:** `style: migrate seller dashboard to Mernin components`

### Task 3.3 — Swap imports on hub dashboard pages
- **Modify:** `app/dashboard/hub/page.tsx`, `hub/hubs/page.tsx`, `hub/catalog/page.tsx`, `hub/members/page.tsx`, `hub/samples/page.tsx`, `hub/payouts/page.tsx`, `hub/shipments/page.tsx`, loading files
- **What:** Same import swaps
- **Blocked by:** 2.1–2.4
- **Verify:** All hub pages render with Mernin components, functionality intact
- **Commit:** `style: migrate hub dashboard to Mernin components`

### Task 3.4 — Swap imports on admin dashboard pages
- **Modify:** `app/dashboard/admin/` pages, `components/admin/admin-console.tsx`
- **What:** Same import swaps
- **Blocked by:** 2.1–2.4
- **Verify:** Admin pages render with Mernin components, functionality intact
- **Commit:** `style: migrate admin dashboard to Mernin components`

### Task 3.5 — Swap imports on shared components
- **Modify:** `components/lot-card.tsx`, `components/lot-detail-view.tsx`, `components/commitment-form.tsx`, `components/sample-request-button.tsx`, `components/seller-lot-csv-upload-modal.tsx`, `components/shipment-status-buttons.tsx`, `components/stripe-connect-button.tsx`, `components/sample-action-buttons.tsx`, `components/lot-image-uploader.tsx`, `components/seller-lot-status-toggle.tsx`, `components/unit-toggle.tsx`
- **What:** Same import swaps for Card, Button, Badge, Input
- **Blocked by:** 2.1–2.4
- **Verify:** Shared components render correctly in their parent pages
- **Commit:** `style: migrate shared components to Mernin imports`

---

## Stage 4: Auth + browse migration

### Task 4.1 — Restyle auth pages
- **Modify:** `app/auth/login/page.tsx`, `app/auth/sign-up/page.tsx`, `app/auth/error/page.tsx`, `app/auth/sign-up-success/page.tsx`
- **What:** Swap Card/Button/Input imports, update page backgrounds to cream, apply Mernin typography
- **Blocked by:** 2.1–2.4
- **Verify:** Auth pages render with Mernin styling, login/signup flows work
- **Commit:** `style: migrate auth pages to Mernin design system`

### Task 4.2 — Restyle browse/marketplace pages
- **Modify:** `app/browse/page.tsx`, `app/browse/[id]/page.tsx`, `app/marketplace/page.tsx`, `app/marketplace/[id]/page.tsx`
- **What:** Swap component imports, update backgrounds and typography
- **Blocked by:** 2.1–2.4
- **Verify:** Browse pages render with Mernin styling, navigation and links work
- **Commit:** `style: migrate browse/marketplace to Mernin design system`

---

## Verification per stage
- `npm run build` passes (no broken imports or type errors)
- Visual check: pages render with Mernin styling
- Functionality check: buttons clickable, forms submittable, navigation works

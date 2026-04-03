# Spec: Mernin Design System Rollout

Date: 2026-04-03

## Feature Summary

Replace all default shadcn/ui components across the dashboard (buyer, seller, hub, admin), auth pages (login, sign-up, error), and browse/marketplace pages with custom Mernin-styled components — matching the bold, chunky visual language already established on the landing pages. This eliminates the visual disconnect between the branded public pages and the generic-looking authenticated app, giving us a unified design system foundation to build on as the product grows.

## Acceptance Criteria

1. Given a user views any page in the dashboard, auth, or browse/marketplace areas, when they look at headlines and subheadings, then headlines will use the Adore Cats display font and subheadings will use Cal Sans — matching the landing page typography.
2. Given a user views any page in the dashboard, auth, or browse/marketplace areas, when they inspect cards, then all cards will use 5px espresso borders, flat offset shadows, and chalk backgrounds — matching the landing page card style.
3. Given a user views any page in the dashboard, auth, or browse/marketplace areas, when they interact with buttons, then primary CTAs will use the pill-shaped stamp-press effect (tomato background, flat shadow, translate on hover/active) and secondary CTAs will use the outlined pill style.
4. Given a user views any dashboard page, when they look at the page background, then it will use the Mernin cream color (#F5F0D8) instead of the current white/gray.

## Non-Goals

- No backend or API changes — all functionality will perform exactly as it does today. This is purely a frontend visual change.
- No layout or information architecture changes — page structure, content, and navigation remain the same. This is a reskin, not a redesign.
- No new features or functionality — we are not adding capabilities, just changing how existing ones look.

## Test Spec

### Criterion 1: Typography
- Happy path: Navigate to any dashboard/auth/browse page — headlines render in Adore Cats, subheadings in Cal Sans. Font files load without FOUT (flash of unstyled text).
- Failure path: Fonts fall back to system-ui or the old default fonts. Page is functional but visually wrong.
- False positive: Fonts render correctly on initial load but fall back to system fonts on client-side navigation (Next.js transition doesn't trigger font load).

### Criterion 2: Cards
- Happy path: All cards show 5px espresso borders, flat offset shadows, chalk backgrounds. Hover effect translates card up-left with increased shadow.
- Failure path: Cards still show the old shadcn style — blurred shadows, thin borders, white backgrounds.
- False positive: Card styling looks correct but the old shadcn Card component is still imported underneath with inline overrides masking it — works visually but is fragile.

### Criterion 3: Buttons
- Happy path: Primary CTAs show pill shape, tomato background, stamp-press effect. Secondary CTAs show outlined pill style. All buttons remain clickable and functional.
- Failure path: Buttons are restyled but click handlers break — the visual is right but functionality is gone.
- False positive: Buttons look correct but the stamp-press active state (translate + shadow removal) doesn't fire because the CSS transition conflicts with an existing onClick handler.

### Criterion 4: Backgrounds
- Happy path: Dashboard pages use cream (#F5F0D8) backgrounds instead of white/gray.
- Failure path: Some pages still show white/gray backgrounds because a parent layout or component has a hardcoded background color overriding the Mernin value.
- False positive: Root layout sets cream background, but individual page sections have bg-white classes that aren't visible until you scroll past the fold.

## Architecture Sketch

### New files (4 custom Mernin components)
- `components/mernin/Card.tsx` — comic-book panel style with 5px espresso borders, flat shadows, chalk background
- `components/mernin/Button.tsx` — primary (stamp-press pill) and outlined variants
- `components/mernin/Badge.tsx` — thick border, pill shape, Mernin color variants
- `components/mernin/Input.tsx` — thick border, flat shadow, tomato focus ring

### Modified files — styling layer
- `app/globals.css` — update CSS variables to Mernin palette so the 11 remaining shadcn components (Select, Dialog, Table, Label, Textarea, Progress, Skeleton, Accordion, Separator, Checkbox) inherit Mernin colors automatically
- `app/dashboard/layout.tsx` — cream background, Mernin fonts on DashboardShell

### Modified files — import swaps (~25+ files)
- All dashboard pages: swap `@/components/ui/card` → `@/components/mernin/Card` (same for Button, Badge, Input)
- Auth pages: same swaps
- Browse/marketplace pages: same swaps
- Shared components (`commitment-form.tsx`, `lot-card.tsx`, `lot-detail-view.tsx`, etc.): same swaps

### Untouched
- `components/ui/` — stays until migration complete, then removed
- `api/` routes — no changes
- Landing pages — already hardcoded Tailwind classes, unaffected by CSS variable changes

### Styling flow
```
globals.css (Mernin CSS vars)
  → shadcn components (Select, Dialog, Table, etc.) inherit automatically
  → components/mernin/* (custom-built with Mernin tokens)
  → dashboard/auth/browse pages consume both
```

## Open Questions

- Mobile responsiveness: The current pages are responsive, but the Mernin styling (thick borders, flat shadows, large fonts) hasn't been tested at mobile breakpoints. May need adjustments — e.g., reducing border width or shadow offset on small screens.
- CSS variable cascade: Assuming the 11 shadcn components will look correct after updating globals.css variables. If any look off, we'll need per-component tweaks.
- 1:1 component API: Assuming the new Mernin Card/Button/Badge/Input will accept the same props as their shadcn counterparts for a clean swap.

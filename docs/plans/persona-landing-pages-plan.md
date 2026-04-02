# Plan: Persona Landing Pages

> **Spec:** specs/persona-landing-pages.md
> **Date:** 2026-04-02

## Tasks

### Task 1: Public intake API endpoint
**File:** `app/api/public-intake/route.ts`
**Dependencies:** none

Create a new unauthenticated POST endpoint. Accepts `requested_role` (seller | hub_owner), `company_name`, `contact_name`, `phone`, `notes`. Validates `requested_role`. Inserts into `role_access_requests` with `user_id: null`, `status: pending`. Returns 201 on success, 400 on invalid input, 500 on DB error.

Note: assumes `user_id` is nullable in `role_access_requests`. If the insert fails due to NOT NULL constraint, surface the error clearly so the schema issue is visible.

---

### Task 2: Hub owner intake form page
**File:** `app/apply/hub/page.tsx`
**Dependencies:** Task 1

Public page at `/apply/hub`. Form collects company name, contact name, phone, notes. On submit, POSTs to `/api/public-intake` with `requested_role: "hub_owner"`. On success, redirects to `/apply/success`. On error, shows inline error message asking user to try again — preserves form data. Styled with Mernin' design system.

---

### Task 3: Seller intake form page
**File:** `app/apply/seller/page.tsx`
**Dependencies:** Task 1

Public page at `/apply/seller`. Same form as Task 2 but with `requested_role: "seller"`. On submit, POSTs to `/api/public-intake`. On success, redirects to `/apply/success`. On error, shows inline error — preserves form data. Styled with Mernin' design system.

---

### Task 4: Shared success page
**File:** `app/apply/success/page.tsx`
**Dependencies:** none

Public page at `/apply/success`. Simple confirmation: tells the user their application was received and we'll get back to them within the next few business days. No persona-specific copy needed. Links back to homepage. Styled with Mernin' design system.

---

### Task 5: Hub owner landing page
**File:** `app/for/hubs/page.tsx`
**Dependencies:** Task 4

Full landing page at `/for/hubs`. Persona: green buyers, consultants, café owners, toll roasters, coffee collectives. Core value prop: "Your community already trusts your palate. Now build a marketplace around it." Sections: marquee bar, hero (curation + community angle), how it works for hub operators (curate → host cuppings → run campaigns → get paid), value cards, social proof (reuse Priya S. testimonial), CTA to `/apply/hub`. Follows Mernin' design system exactly — same tokens, typography, component patterns as `app/page.tsx`. Accent emphasis: chalk/espresso-led.

---

### Task 6: Seller/farm landing page
**File:** `app/for/sellers/page.tsx`
**Dependencies:** Task 4

Full landing page at `/for/sellers`. Persona: exporters, importers, farm direct sellers. Core value prop: "Know your volume before you ship. Reach committed specialty roasters. Get paid on settlement." Sections: marquee bar, hero (volume certainty + payment reliability), how it works for sellers (list lot → campaign runs → volume commits → settlement pays out), value cards, social proof (reuse João M. testimonial), CTA to `/apply/seller`. Follows Mernin' design system — accent emphasis: matcha-led.

---

### Task 7: Homepage roaster refresh
**File:** `app/page.tsx`
**Dependencies:** Tasks 5, 6

Update the existing homepage to be fully roaster-focused. Update the Hub Owners and Sellers/Farms persona cards in the "Built for everyone" section to include "Learn more →" links to `/for/hubs` and `/for/sellers` respectively. No other structural changes — the page already speaks roaster language well.

---

### Task 8: Site header persona nav links
**File:** `components/site-header.tsx`
**Dependencies:** Tasks 5, 6

Add navigation links to all three persona pages in both desktop nav and mobile dropdown. Links: "For Roasters" → `/`, "For Hubs" → `/for/hubs`, "For Sellers" → `/for/sellers`. Style as plain text nav links (not buttons) consistent with existing nav patterns. Add to both desktop and mobile menus.

---

## Task Graph

```
Task 1 (API)        ──► Task 2 (hub form)   ──► Task 5 (hubs page) ──► Task 7 (homepage)
                    ──► Task 3 (seller form) ──► Task 6 (sellers page) ──► Task 7 (homepage)
Task 4 (success)    ──► Task 2, Task 3
Tasks 5, 6          ──► Task 8 (site-header)
```

**Stage 1 (parallel):** Tasks 1, 4
**Stage 2 (parallel):** Tasks 2, 3
**Stage 3 (parallel):** Tasks 5, 6
**Stage 4 (sequential):** Task 7, then Task 8

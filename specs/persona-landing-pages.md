# Spec: Persona Landing Pages

Date: 2026-04-02

## Feature Summary

The current homepage tries to pitch three distinct user types — roasters, hub owners, and sellers/farms — simultaneously, causing confusion and reducing conversion. This feature splits the single landing page into three persona-specific pages, each making a complete, focused case for that user type. The roaster page remains the primary homepage (`/`). Hub owners and sellers get dedicated pages (`/for/hubs`, `/for/sellers`) that can be linked to directly. Hub owners and sellers are directed to a new public intake form (no login required) rather than the general sign-up flow.

## Acceptance Criteria

1. Given a roaster lands on `/`, when they view the page, then they see only roaster-relevant messaging with a primary CTA that links to `/auth/sign-up`.
2. Given a hub owner lands on `/for/hubs`, when they view the page, then they see only hub-owner-relevant messaging (including curating lots, hosting cuppings, community building, toll roasters and collectives) with a primary CTA that links to the public hub owner intake form.
3. Given a seller/farm lands on `/for/sellers`, when they view the page, then they see only seller-relevant messaging with a primary CTA that links to the public seller intake form.
4. Given a user submits the public hub owner or seller intake form, when the form is submitted successfully, then their request is saved to `role_access_requests` (no login required) and they are shown a shared success page confirming we will get back to them within the next few business days.
5. Given a user is on any of the three landing pages, when they view the navbar, then they see navigation links to all three persona pages.
6. Given any of the three landing pages, when viewed, then it uses only Mernin' design system tokens, typography, and component patterns consistent with the current homepage.

## Non-Goals

- No new seller or hub owner sign-up/authentication flows.
- No changes to any auth-gated pages (dashboard, existing `/dashboard/buyer/access-request` form).
- No changes to the existing admin review panel — public intake submissions surface there automatically via the shared `role_access_requests` table.

## Test Spec

### Criterion 4: Public intake form saves submission without auth

- **Happy path:** POST to `/api/public-intake` with valid `requested_role`, `company_name`, `contact_name`, `phone`, and `notes` returns 201 and a record exists in `role_access_requests` with status `pending`.
- **Failure path:** If the API returns an error, the form displays an inline error message asking the user to try again. The user is not redirected and their form data is preserved.
- **False positive check:** A test that mocks the API and always returns 201 would pass even if the DB insert fails — use an integration test that hits a real (test) database to confirm the record is actually written.

### Criteria 1–3: Persona-specific page content

- **Happy path:** Each page renders without the other personas' primary CTAs or role-specific value props visible.
- **Failure path:** If a page fails to render, Next.js error boundary catches it — no persona-specific test beyond visual review.
- **False positive check:** A test that only checks the page renders (200 OK) would pass even if wrong content is shown — content verification is manual/visual.

### Criteria 5–6: Navbar links and design system

- Manual/visual verification only. No automated tests.

## Architecture Sketch

**New files:**
- `app/for/hubs/page.tsx` — hub owner landing page
- `app/for/sellers/page.tsx` — seller/farm landing page
- `app/apply/hub/page.tsx` — public hub owner intake form
- `app/apply/seller/page.tsx` — public seller intake form
- `app/apply/success/page.tsx` — shared success page post-submission
- `app/api/public-intake/route.ts` — unauthenticated POST endpoint; writes to `role_access_requests` with `user_id: null`

**Modified files:**
- `app/page.tsx` — roaster-focused refresh; remove diluted personas section or update hub/seller cards to link to their dedicated pages
- `components/site-header.tsx` — add navigation links to all three persona pages

**Data flow:**
```
/apply/hub or /apply/seller
  → POST /api/public-intake { requested_role, company_name, contact_name, phone, notes }
  → insert into role_access_requests (user_id: null, status: pending)
  → redirect to /apply/success
  → visible in existing /dashboard/admin/requests panel
```

## Open Questions

- **`user_id` nullability:** The `role_access_requests.user_id` column is assumed nullable. Must be confirmed before implementing `/api/public-intake` — if not nullable, a schema migration or separate table is required.
- **Success page:** Shared between hub and seller submissions. May need a query param (`?role=hub_owner`) if persona-specific copy is ever needed, but not required now.
- **Intake form fields:** Same as existing dashboard form — company name, contact name, phone, notes. Required fields TBD during implementation (currently all optional in the existing form).

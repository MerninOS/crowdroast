# Spec: Hub Access Requests

Date: 2026-04-03

## Feature Summary

Buyers (roasters) who aren't associated with a hub currently have no way to join one — they're blocked from committing to lots. This feature adds a self-service flow where buyers can browse active hubs, request access to one, and hub owners can approve or deny those requests via email or the hub members dashboard. It also lets buyers leave their current hub (with safeguards against leaving with open commitments). This removes the dependency on hub owners having to know a buyer's email upfront to invite them.

## Acceptance Criteria

1. Given a buyer with no hub, when they navigate to `/dashboard/find-hub`, then they will see a searchable list of active hubs with name, address, and state, filterable by state.
2. Given a buyer viewing the hub list, when they click "Request Access" on a hub, then a `hub_access_requests` record will be created with status `pending` and the hub owner will receive an email with the buyer's info and a link to the hub members page.
3. Given a hub owner who receives a request email, when they click the link and approve the request from the members page, then the buyer will become an `active` hub_member and receive an approval email.
4. Given a hub owner who receives a request email, when they click the link and deny the request from the members page, then the request status will update to `denied` and the buyer will receive a denial email.
5. Given a buyer whose request was denied, when they visit `/dashboard/find-hub` again after the 7-day cooldown, then they will be able to submit a new request to the same hub.
6. Given a buyer who is an active member of a hub with no open commitments on unclosed lots, when they click "Leave Hub" and confirm in the modal, then their hub_member status will update to `removed` and they will be redirected to the main dashboard.
7. Given a buyer who is an active member of a hub with active commitments on unclosed lots, when they attempt to leave, then the modal will inform them they cannot leave until those commitments are closed.
8. Given a buyer who already has a pending request or is already active in a hub, when they try to request another hub, then the action will be blocked (one hub at a time).
9. Given a hub owner viewing `/dashboard/hub/members`, when there are pending access requests for their hub, then the requests will be displayed with the buyer's name/email and Approve/Deny buttons.
10. Given a buyer with a pending request to Hub A, when a hub owner from Hub B invites them directly (existing invite flow), then the pending request to Hub A will be cancelled and the buyer will become active in Hub B.

## Non-Goals

- Not adding hub discovery for non-authenticated users. The find-hub page is only for logged-in buyers.
- Not allowing buyers to be in multiple hubs simultaneously. One hub per buyer remains the constraint.
- Not adding in-app notifications. Approval/denial communication is email-only (no bell icon, no notification center).
- Not letting hub owners customize their hub profile (description, logo, etc.) to attract buyers — this is a directory, not a marketplace listing.

## Test Spec

### Criterion 1: Hub list page
- Happy path: Buyer with no hub visits `/dashboard/find-hub`, sees list of active hubs with name/address/state. Filtering by state narrows results. Search by name works.
- Failure path: No active hubs exist — buyer sees an empty state message. Buyer who already has a hub sees their current hub status instead.
- False positive check: Test could pass showing hubs with `is_active: false`. Ensure test data includes both active and inactive hubs and asserts only active ones appear.

### Criterion 2: Request access
- Happy path: Buyer clicks "Request Access," `hub_access_requests` record is created with `pending` status, hub owner receives email with buyer info.
- Failure path: Buyer already has a pending request — API returns error, no duplicate record created. Buyer already in a hub — button is disabled or hidden.
- False positive check: Test could pass if it only checks the API response without verifying the DB record was actually created and the email was sent.

### Criteria 3 & 4: Approve/Deny
- Happy path (approve): Hub owner clicks approve on members page, buyer becomes `active` hub_member, buyer gets approval email, request status updates to `approved`.
- Happy path (deny): Hub owner clicks deny, request becomes `denied`, buyer gets denial email, no hub_member record created.
- Failure path: Approve clicked twice — second click is a no-op (idempotent). Request already cancelled (buyer was invited elsewhere per criterion 10) — approve fails gracefully.
- False positive check: Test checks hub_member was created but doesn't verify the buyer wasn't already a member of another hub. Ensure test validates the one-hub constraint.

### Criteria 6 & 7: Leave hub
- Happy path: Buyer with no open commitments clicks "Leave Hub," confirms in modal, status becomes `removed`, redirected to `/dashboard`.
- Failure path: Buyer with active commitments on unclosed lots — modal blocks the action with explanation.
- False positive check: Test uses a buyer with commitments on *closed* lots (which should allow leaving). Ensure test distinguishes between open and closed lot commitments.

### Criterion 10: Cross-hub invite cancellation
- Happy path: Buyer has pending request to Hub A, Hub B owner invites them directly — pending request to Hub A is cancelled, buyer is active in Hub B.
- Failure path: Buyer has pending request, gets *denied* at Hub A (not cancelled) — should still be able to accept Hub B invite separately.
- False positive check: Test cancels the request but doesn't verify the buyer isn't left in a state where they appear in both hubs' member lists.

## Architecture Sketch

### Database
- New table: `hub_access_requests` with columns: `id` (uuid), `hub_id` (fk → hubs), `user_id` (fk → profiles), `status` (pending/approved/denied/cancelled), `created_at`, `updated_at`
- New constraint: enforce one active hub per buyer on `hub_members` (partial unique index on `user_id WHERE status = 'active'`)

### API Routes
- `GET /api/hubs` — returns active hubs for browsing (name, address, state)
- `POST /api/hub-access-requests` — buyer creates a pending request
- `PATCH /api/hub-access-requests/[id]` — hub owner approves or denies
- `POST /api/hub-members/leave` — buyer leaves their current hub

### Email
- New template: `HubAccessRequest.tsx` — sent to hub owner with buyer info, links to `/dashboard/hub/members`
- New template: `HubAccessApproved.tsx` — sent to buyer on approval
- New template: `HubAccessDenied.tsx` — sent to buyer on denial
- New email functions in `lib/email/index.ts`: `sendHubAccessRequestEmail()`, `sendHubAccessApprovedEmail()`, `sendHubAccessDeniedEmail()`

### Frontend
- New page: `app/dashboard/find-hub/page.tsx` — searchable/filterable hub list with Request Access buttons
- Modified: `app/dashboard/hub/page.tsx` — show "Find a Hub" CTA when buyer has no hub association
- Modified: `app/dashboard/hub/members/page.tsx` — add pending requests section with Approve/Deny buttons
- New component: Leave Hub confirmation modal (checks for open commitments before allowing)

### Data Flows
1. **Request:** Buyer browses hubs → clicks Request Access → `POST /api/hub-access-requests` creates record → `sendHubAccessRequestEmail()` fires to hub owner
2. **Approve:** Hub owner visits members page (via email link or directly) → sees pending requests → clicks Approve → `PATCH /api/hub-access-requests/[id]` updates to `approved`, creates `hub_member` with `active` status, cancels any other pending requests for that buyer → `sendHubAccessApprovedEmail()` fires to buyer
3. **Deny:** Same flow → status to `denied` → `sendHubAccessDeniedEmail()` fires to buyer
4. **Leave:** Buyer clicks Leave Hub → modal checks for open commitments → if none, confirms → `POST /api/hub-members/leave` sets status to `removed` → redirect to `/dashboard`
5. **Cross-invite:** Hub B owner invites buyer who has pending request to Hub A → existing invite flow creates active hub_member in Hub B → cancels pending request to Hub A

## Open Questions

- One-hub-per-buyer is NOT enforced in the DB today. The unique constraint on `hub_members` is `(hub_id, user_id)`, not unique on `user_id` alone. Need to add enforcement — likely a partial unique index on `user_id WHERE status = 'active'`.
- "Open commitment" defined as: a commitment where the associated lot's deadline has not yet passed. Need to verify the exact column/relationship used (commitments → lots → deadline).
- 7-day cooldown on re-requesting the same hub after denial. No limit on requesting different hubs.
- Past commitments on closed lots remain visible after a buyer leaves a hub. Buyer loses access to new lots from the former hub only.

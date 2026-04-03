> **Spec:** specs/hub-access-requests.md
> **For Claude:** Use `build` to execute this plan.

# Hub Access Requests — Implementation Plan

## Stage 1: Database & Types

### Task 1.1: Create `hub_access_requests` table + RLS
- **Create:** `scripts/014_hub_access_requests.sql`
- Table: `hub_access_requests` with columns: `id` (uuid pk), `hub_id` (fk → hubs), `user_id` (fk → profiles), `status` (pending/approved/denied/cancelled), `created_at` (timestamptz), `updated_at` (timestamptz)
- Check constraint on status
- RLS policies: buyers see own requests, hub owners see requests for their hubs
- Partial unique index: prevent multiple pending requests per user (`unique on user_id WHERE status = 'pending'`)
- **Commit:** `feat(db): add hub_access_requests table with RLS`
- **Verify:** SQL is syntactically valid, matches spec

### Task 1.2: Add one-active-hub-per-buyer constraint
- **Modify:** `scripts/014_hub_access_requests.sql` (same file)
- Add partial unique index on `hub_members`: `unique on user_id WHERE status = 'active'`
- This enforces the one-hub-per-buyer constraint at DB level
- **Verify:** Index would prevent inserting two active memberships for same user

### Task 1.3: Add TypeScript types
- **Modify:** `lib/types.ts`
- Add `HubAccessRequestStatus` type: `"pending" | "approved" | "denied" | "cancelled"`
- Add `HubAccessRequest` interface with all columns + optional joined fields (hub, user/profile)
- **Commit:** `feat(types): add HubAccessRequest type`
- **Verify:** Types compile, match DB schema

---

## Stage 2: Email Templates & Functions

### Task 2.1: Hub access request email template (to hub owner)
- **Create:** `lib/email/templates/HubAccessRequest.tsx`
- Follow pattern from `BuyerJoinedHub.tsx`: same styles, react-email components
- Content: "{buyerName} is requesting to join {hubName}. View and respond on your members page."
- Include link to `/dashboard/hub/members`
- Export `renderHubAccessRequestHtml()`
- **Verify:** Template renders without error

### Task 2.2: Hub access approved email template (to buyer)
- **Create:** `lib/email/templates/HubAccessApproved.tsx`
- Content: "Your request to join {hubName} has been approved. You can now browse and commit to lots."
- Include link to `/dashboard/buyer`
- Export `renderHubAccessApprovedHtml()`
- **Verify:** Template renders without error

### Task 2.3: Hub access denied email template (to buyer)
- **Create:** `lib/email/templates/HubAccessDenied.tsx`
- Content: "Your request to join {hubName} was not approved. You can request access to other hubs."
- Include link to `/dashboard/find-hub`
- Export `renderHubAccessDeniedHtml()`
- **Verify:** Template renders without error

### Task 2.4: Add email send functions
- **Modify:** `lib/email/index.ts`
- Add `sendHubAccessRequestEmail()` — sends to hub owner
- Add `sendHubAccessApprovedEmail()` — sends to buyer
- Add `sendHubAccessDeniedEmail()` — sends to buyer
- Follow existing patterns (params interface, null email guard, fire-and-forget)
- **Commit:** `feat(email): add hub access request/approved/denied templates and functions`
- **Verify:** Functions match existing patterns, imports resolve

---

## Stage 3: API Routes

### Task 3.1: GET /api/hubs — browsable hub list
- **Create:** `app/api/hubs/route.ts`
- GET: authenticated buyers only. Return active hubs with `id`, `name`, `address`, `city`, `state`, `country`
- Do NOT return `owner_id`, `capacity_kg`, or other internal fields
- No RLS bypass needed — use service client or add a select policy for active hubs
- **Commit:** `feat(api): add GET /api/hubs for hub browsing`
- **Verify:** Returns only active hubs, only public fields

### Task 3.2: POST /api/hub-access-requests — create request
- **Create:** `app/api/hub-access-requests/route.ts`
- Auth: must be a buyer
- Validations: hub exists and is active, buyer not already in a hub (check hub_members where status=active), no pending request exists, 7-day cooldown for same hub after denial
- Creates `hub_access_requests` record with status `pending`
- Sends email to hub owner via `sendHubAccessRequestEmail()`
- **Verify:** All validation cases covered, email fires

### Task 3.3: GET /api/hub-access-requests — buyer's own requests
- **Create:** `app/api/hub-access-requests/route.ts` (same file, GET handler)
- Auth: authenticated user
- Returns the user's hub access requests with hub info joined
- **Verify:** Only returns authenticated user's requests

### Task 3.4: PATCH /api/hub-access-requests/[id] — approve/deny
- **Create:** `app/api/hub-access-requests/[id]/route.ts`
- Auth: must be hub owner of the request's target hub
- Body: `{ action: "approve" | "deny" }`
- Approve flow: update request to `approved`, create `hub_member` (active), cancel any other pending requests for this buyer, send approved email
- Deny flow: update request to `denied`, send denied email
- Idempotent: if already processed, return current state without side effects
- Use admin client for cross-table transaction (cancel other requests)
- **Commit:** `feat(api): add hub access request CRUD and approve/deny endpoints`
- **Verify:** Approve creates member, deny doesn't, idempotent on re-click

### Task 3.5: POST /api/hub-members/leave — buyer leaves hub
- **Create:** `app/api/hub-members/leave/route.ts`
- Auth: must be authenticated buyer
- Check for open commitments: query commitments where buyer_id = user.id, lot has commitment_deadline in future, status not cancelled
- If open commitments exist: return 409 with list of blocking lots
- If none: update hub_member status to `removed`
- **Commit:** `feat(api): add leave hub endpoint with commitment guard`
- **Verify:** Blocks with open commitments, allows without

### Task 3.6: Update existing hub-members POST to cancel pending requests
- **Modify:** `app/api/hub-members/route.ts`
- After successfully adding a buyer to a hub (existing invite flow), cancel any pending `hub_access_requests` for that buyer
- This implements criterion 10 (cross-hub invite cancellation)
- **Commit:** `feat(api): cancel pending hub requests on direct invite`
- **Verify:** Pending request cancelled when buyer is directly invited

---

## Stage 4: Frontend — Find Hub Page & Buyer Dashboard

### Task 4.1: Create find-hub page
- **Create:** `app/dashboard/find-hub/page.tsx`
- Server component that fetches active hubs
- Client component for search/filter UI:
  - Search input (filters by hub name)
  - State filter dropdown (populated from hub data)
  - Hub cards showing: name, address, city, state
  - "Request Access" button per hub
  - Disable button if buyer already has pending request or is in a hub
- Show pending request status if one exists
- Follow Mernin' design system (chunky borders, flat shadows, warm colors)
- **Commit:** `feat(ui): add find-hub page with search and state filter`
- **Verify:** Hub list renders, search filters, state filter works, request button calls API

### Task 4.2: Update buyer dashboard empty state
- **Modify:** `app/dashboard/buyer/page.tsx`
- In the `hubIds.length === 0` block (lines 59-81): add a "Find a Hub" button linking to `/dashboard/find-hub`
- Also check for pending request and show status if one exists
- **Commit:** `feat(ui): add find-hub CTA to buyer dashboard empty state`
- **Verify:** Button appears when no hub, links correctly

### Task 4.3: Add pending requests section to hub members page
- **Modify:** `app/dashboard/hub/members/page.tsx`
- Fetch pending `hub_access_requests` for the selected hub
- Display above the members table: card per request with buyer name/email/company, Approve and Deny buttons
- On approve: call PATCH with `action: "approve"`, refresh members list
- On deny: call PATCH with `action: "deny"`, remove from pending list
- **Commit:** `feat(ui): add pending access requests to hub members page`
- **Verify:** Pending requests display, approve adds to members, deny removes from pending

### Task 4.4: Add leave hub functionality to buyer dashboard
- **Modify:** `app/dashboard/buyer/page.tsx`
- When buyer IS in a hub: add "Leave Hub" button (small, secondary/outline style)
- On click: open confirmation modal
  - Modal calls `/api/hub-members/leave` to check for open commitments
  - If blocked: show message listing the lots preventing departure
  - If clear: confirm dialog, on confirm call the leave endpoint, redirect to `/dashboard`
- **Commit:** `feat(ui): add leave hub modal with commitment guard`
- **Verify:** Modal shows, blocks with commitments, allows and redirects without

---

## Stage 5: Polish & Integration

### Task 5.1: Add find-hub to dashboard navigation
- **Modify:** Dashboard navigation component (likely in `components/dashboard-shell.tsx` or similar)
- Add "Find a Hub" nav item for buyers who are not in a hub
- blockedBy: Task 4.1
- **Commit:** `feat(nav): add find-hub link for unaffiliated buyers`
- **Verify:** Nav item appears for buyers without hub, hidden for those with one

### Task 5.2: End-to-end flow verification
- Manual test: create buyer → browse hubs → request access → hub owner sees request on members page → approve → buyer sees hub lots
- Manual test: deny flow → buyer gets denial email → waits cooldown → can re-request
- Manual test: leave hub → blocked by commitment → close lot → leave succeeds
- Manual test: cross-hub invite cancellation
- **Verify:** All 10 acceptance criteria pass

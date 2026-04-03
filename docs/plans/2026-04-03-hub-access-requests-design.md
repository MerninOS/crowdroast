# Hub Access Requests — Design

> **Spec:** specs/hub-access-requests.md

## Chosen Approach: New `hub_access_requests` table + API routes

Clean separation between access requests and hub membership. Requests are a distinct lifecycle (pending → approved/denied/cancelled) managed by hub owners, not admins.

## Why This Over Alternatives

- **Not extending hub_members with "pending" status** — muddies RLS policies (pending members shouldn't see hub lots), cooldown logic gets messy, cross-hub invite cancellation is complex with shared status.
- **Not reusing role_access_requests** — wrong abstraction (role requests → admins, hub requests → hub owners), would conflate two approval workflows.

## Security Concerns

- Only buyers can create requests (role check in API)
- Only the target hub's owner can approve/deny (ownership check in API)
- Leave endpoint restricted to authenticated buyer's own membership
- RLS on new table: buyers see their own requests, hub owners see requests for their hub

## Race Condition Mitigation

- Cross-hub invite cancellation: use transaction when creating hub_member + cancelling pending requests
- Idempotent approve/deny: check request status before acting, no-op if already processed

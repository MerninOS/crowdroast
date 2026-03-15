# Spec: Email Notification System

## Feature Summary

CrowdRoast currently has no email service. Users must manually check the app
and risk missing critical moments — buyers miss lot campaigns before deadlines,
sellers miss closed lots and delay shipments. This feature adds a backend email
utility/service (built on Resend + React Email) that can be called from any API
route or cron handler to trigger transactional emails at key moments. The goal
is to make the sale of a coffee lot seamless for all three user roles (buyer,
seller, hub owner) while building excitement around new lots.

---

## Acceptance Criteria

### Seller Invitation

**AC-1a:** Given a user does not yet have an account, when an admin or hub
owner submits an email as a seller invitation, then that email receives a
"You've been invited to sell your coffee on CrowdRoast" email with seller
benefits copy and a signup link that pre-fills their email address and routes
to the seller-specific signup flow.

**AC-1b:** Given an invitation email fails to deliver, then the inviting admin
or hub owner sees a "Failed to deliver" state in the UI.

**AC-1c (edge case):** Given an email address has already been invited, when it
is submitted again, then no email is sent and no error is shown.

---

### Sample Request

**AC-2:** Given a hub owner submits a sample request, then the seller receives
one "Sample Request" email summarizing all samples requested, the hub owner's
shipping address, quantities for each, and a link to `/samples` to fulfill
them. No confirmation is shown to the hub owner.

---

### Buyer Joins Hub

**AC-3:** Given a buyer completes signup after being invited to a hub, then the
hub owner receives an informational email that the buyer has joined their hub,
including the buyer's name and company name. No action is required from the hub
owner.

---

### New Coffees From Seller

**AC-4:** Given a seller adds one or more new coffee lots to the platform, then
hub owners who have previously requested samples from or added coffees from
that seller receive one email summarizing the new lots added, with a link to
`/catalog` to view them.

---

### Hub Launches New Coffees

**AC-5:** Given a hub owner adds one or more coffees to their hub catalog, then
all buyers associated with that hub receive one email summarizing the newly
added coffees, with a link to `/catalog`. Multiple coffees added in the same
action are batched into one email.

---

### Lot Closes — Successful Campaign

**AC-6a (Buyer):** Given a lot successfully closes, then all buyers who
invested receive an email confirming their order was processed, including their
investment amount and a link to view their order.

**AC-6b (Seller):** Given a lot successfully closes, then the seller receives
an email to prepare for shipment, including the lot name, total quantity sold,
the hub owner's shipping address, and a link to manage fulfillment in the app.

**AC-6c (Hub Owner):** Given a lot successfully closes, then the hub owner
receives an email confirming a payout is coming automatically, and that they
will be notified when the seller ships to their hub.

---

### Lot Closes — Failed Campaign

**AC-7:** Given a lot reaches its deadline without hitting the minimum funding
goal, then the seller, all invested buyers, and the hub owner each receive an
email notifying them the campaign did not succeed, that all invested funds have
been returned to the buyers, and that no sale was triggered.

---

### Buyer Lot Updates

**AC-8a (Deadline reminder):** Given a lot has 24 hours remaining before its
deadline, then all buyers in the hub who have *not* yet invested receive an
email urging them to invest before the deadline closes.

**AC-8b (Price drop — existing investors):** Given a lot hits a predetermined
sales volume milestone that triggers a price drop, then buyers who have already
invested receive an email notifying them the price has dropped and they can
purchase more coffee at the lower price.

**AC-8c (Price drop — non-investors):** Given a lot hits a price drop
milestone, then buyers in the hub who have *not* yet invested receive an email
notifying them the price has dropped and encouraging them to invest before the
deadline.

---

## Non-Goals

1. Push notifications of any kind
2. In-app notifications
3. Dedicated landing pages tied to invite links (links point to existing pages only)
4. Email preferences, unsubscribe flows, or opt-out management
5. Any UI changes beyond showing a "Failed to deliver" state on seller invitation

---

## Test Spec

### Test Pattern 1 — User-Action Triggered (e.g. AC-2 Sample Request)
- **Happy path:** Call the resolver/route that triggers the action. Assert the
  mocked email service was called once with the expected recipient, template,
  and data payload.
- **Failure path:** If data is missing or malformed, assert the email service
  was not called and an appropriate error is returned.

### Test Pattern 2 — Cron-Triggered (e.g. AC-6 Lot Closes)
- **Happy path:** Call the cron handler directly with a seeded lot in the
  expected state (deadline passed, funded). Assert the mocked email service was
  called for each expected recipient with the correct data.
- **Failure path:** Lot in an ineligible state (e.g. still open, not yet at
  deadline) should not trigger any emails.
- **Note:** Do not test the cron schedule itself — test the handler function
  the cron calls. The payment settlement cron is the reference implementation.

### Test Pattern 3 — Conditional Recipients (e.g. AC-4 New Seller Coffees)
- **Happy path:** Seed mock users with the qualifying relationship (hub owner
  previously connected to seller). Assert emails go only to those users.
- **Failure path:** Mock users without the qualifying relationship should
  receive no emails.

### General Approach
- Mock the email transport layer in all tests — no real emails sent
- Assert on call arguments: recipient address, template used, data payload
- Production sends to live email addresses via Resend

---

## Architecture Sketch

```
lib/
  email/
    transport.ts          ← generic sendEmail(), wraps Resend SDK
    templates/
      SellerInvite.tsx        (AC-1)
      SampleRequest.tsx       (AC-2)
      BuyerJoinedHub.tsx      (AC-3)
      NewSellerCoffees.tsx    (AC-4)
      HubNewCoffees.tsx       (AC-5)
      LotClosedSuccess.tsx    (AC-6a/b/c — three variants)
      LotClosedFailed.tsx     (AC-7)
      DeadlineReminder.tsx    (AC-8a)
      PriceDrop.tsx           (AC-8b/c — two variants)
    index.ts              ← named functions exported for use in routes/crons
```

**Data flow:**
1. API route or cron handler calls a named function, e.g.
   `sendSampleRequestEmail(seller, hubOwner, samples)`
2. Named function renders its React Email template with typed props
3. Rendered HTML is passed to `transport.ts`
4. `transport.ts` sends via Resend SDK

Templates are JSX components (React Email). Each named function accepts
strongly-typed data objects — no raw subject/body strings passed from routes.

---

## Open Questions

1. **Seller invite gate** — the invite-only signup flow for sellers may need
   to be built. This is a dependency for AC-1 but out of scope for this
   feature. Assumption: handled separately.
2. **Email copy** — who writes the content for each template? Developer
   responsibility or a separate stakeholder?
3. **Volume/rate limits** — lot close events could trigger many emails at once
   (e.g. 100+ buyers). Confirm Resend plan supports burst sending before
   going to production.

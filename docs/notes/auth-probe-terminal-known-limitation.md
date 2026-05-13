# Known limitation: `auth_probe_failed` is unconditionally terminal

**Status**: Documented, not fixed. Captured during the pre-PR code review on the bag-aware-campaign-close branch (finding M7).

## What this is

When `probeCardAuth` in `lib/stripe.ts` returns `{ ok: false, reason }` during the `checkout.session.completed` (mode: setup) webhook handler at `app/api/stripe/webhook/route.ts`, two things happen:

1. The buyer's commitment row gets `payment_error` set (e.g., `"Auth probe failed: card_declined"`).
2. `card_auth_failed_email_sent_at` is stamped (one email per commitment per probe, regardless of webhook retries — fixed in finding M4).

When settlement later creates `commitment_bag_charges` rows for this buyer's bags, the charge worker reads `commitment.payment_error IS NOT NULL` (see `lib/charge-worker.ts`) and flips the bag rows to terminal `payment_failed` with `failed_reason = 'auth_probe_failed'` — **without ever calling Stripe**.

## The known gap

The `probeCardAuth` call can fail for several reasons:
- **Real card decline** (correct: terminal failure is the right outcome)
- **Network blip** between the webhook handler and Stripe's API (rare but possible — Stripe's network is not 100% available)
- **Stripe API degradation** (rate limits, intermittent 5xx errors)

The current code does NOT distinguish these. All three paths land at the same `auth_probe_failed` terminal state. A buyer with a perfectly good card can have their bag-portion permanently dropped because a 30-second Stripe outage coincided with their setup-mode webhook delivery.

## Mitigation today

- **The webhook is idempotent**: Stripe retries the webhook on non-2xx response. The auth probe re-runs on retry (deterministic idempotency key — Stripe replays the prior outcome). So a transient network failure between Stripe's API and the webhook handler will typically self-recover on the second delivery.
- **Operational visibility**: rows in terminal `auth_probe_failed` state surface in the admin Failed Payments dashboard (`/dashboard/admin/failed-payments`) with the failure reason. Ops can manually trigger a retry via the "Retry charge" action (which flips the row back to `awaiting_charge` for the worker to re-attempt). On the retry, the worker re-checks `commitment.payment_error` — if it's been cleared OR the buyer added a new payment method, the charge can proceed.

## What would close the gap

Two options, both deferred until real production data shows the failure rate:

**Option A — Make `auth_probe_failed` retryable in the worker.**
Currently the worker treats it as terminal. Change to: if `commitment.payment_error LIKE 'Auth probe failed%'`, retry up to N times (with the same 0/12/48h ladder) before going terminal. Requires the worker to call `probeCardAuth` again on each retry, OR trust that a successful settlement-time charge implies the card is valid (skip the probe).

**Option B — Distinguish transient from real declines at probe time.**
Categorize the Stripe error returned by `probeCardAuth`. If the error matches the transient heuristic (`isTransientStripeError` in `lib/charge-worker.ts:127-140`), treat it as recoverable: set `payment_error = 'Auth probe transient: …'` and add a separate column `auth_probe_retries_remaining INTEGER`. The worker checks this column and re-runs `probeCardAuth` instead of charging directly until retries are exhausted.

**Recommendation when this matters**: Option B is cleaner because it preserves the per-commit one-probe model. Wire it up only after you have production data showing a non-trivial number of `auth_probe_failed` rows that look transient (e.g., cluster around a specific time window, or coincide with a Stripe status page incident).

## Why we're not fixing it now

- Stripe's webhook retry semantics already handle most transient failures by default
- The admin "Retry charge" remediation path exists and is documented
- The failure mode is silent for the buyer but visible for ops — the right tradeoff for v1
- The fix requires either schema changes (Option B) or worker refactoring (Option A); neither is appropriate to ship under the current PR's scope

-- Track the actual Stripe processing fee per commitment.
--
-- CrowdRoast covers the Stripe processing fee out of its own platform share at
-- settlement time, so seller and hub always receive their full split. Storing
-- the actual fee from balance_transaction.fee makes it auditable per-commit
-- and allows accounting/reporting to surface the real cost (especially for
-- minimum-not-met campaigns where Stripe does not refund the fee).

alter table public.commitments
  add column if not exists stripe_fee_cents integer;

comment on column public.commitments.stripe_fee_cents is
  'Stripe processing fee for this commitment''s charge (BalanceTransaction.fee). Absorbed by CrowdRoast — deducted from platform share at settle time.';

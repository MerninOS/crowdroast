-- Stripe Connect + settlement tracking

-- Profiles: Stripe customer (buyers) and Connect account (sellers/hub owners)
alter table public.profiles
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_connect_account_id text;

create index if not exists idx_profiles_stripe_customer_id on public.profiles (stripe_customer_id);
create index if not exists idx_profiles_stripe_connect_account_id on public.profiles (stripe_connect_account_id);

-- Lots: settlement lifecycle
alter table public.lots
  add column if not exists settlement_status text not null default 'pending'
    check (settlement_status in ('pending', 'settled', 'minimum_not_met', 'failed')),
  add column if not exists settlement_processed_at timestamptz;

create index if not exists idx_lots_deadline_settlement on public.lots (commitment_deadline, settlement_status);

-- Commitments: payment setup and charge tracking
alter table public.commitments
  add column if not exists payment_status text not null default 'pending_setup'
    check (payment_status in ('pending_setup', 'setup_complete', 'charge_succeeded', 'charge_failed', 'cancelled')),
  add column if not exists charge_amount_cents integer,
  add column if not exists charge_currency text,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_setup_intent_id text,
  add column if not exists stripe_payment_method_id text,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_charge_id text,
  add column if not exists payment_error text,
  add column if not exists charged_at timestamptz;

create index if not exists idx_commitments_lot_payment_status on public.commitments (lot_id, payment_status);
create unique index if not exists idx_commitments_checkout_session_unique
  on public.commitments (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

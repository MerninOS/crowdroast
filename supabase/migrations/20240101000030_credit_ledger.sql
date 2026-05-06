-- Buyer referral invites: append-only ledger of credit movements. A user's
-- balance is SUM(amount_cents) for that user. The ledger replaces the older
-- FIFO/whole-bonus design — credits are fungible dollars.
--
-- Reasons:
--   referral_earned  positive, source_attribution_id set
--   commit_applied   negative, source_commitment_id set
--   admin_adjust     non-zero, granted_by_admin_id set, free-text note
--
-- Idempotency is enforced by partial unique indexes on the source_* columns
-- so cron retries never double-credit or double-debit.
--
-- See spec: ~/Documents/crowdroast/buyer-referral-invites/spec.md

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount_cents integer not null check (amount_cents <> 0),
  reason text not null check (reason in ('referral_earned','commit_applied','admin_adjust')),
  source_attribution_id uuid null references public.referral_attributions(id) on delete restrict,
  source_commitment_id uuid null references public.commitments(id) on delete restrict,
  granted_by_admin_id uuid null references public.profiles(id) on delete restrict,
  note text null,
  created_at timestamptz not null default now(),

  -- Per-reason invariants. A row's shape must match its reason exactly.
  constraint credit_ledger_shape_check check (
    (reason = 'referral_earned'
      and source_attribution_id is not null
      and source_commitment_id is null
      and granted_by_admin_id is null
      and amount_cents > 0)
    or (reason = 'commit_applied'
      and source_commitment_id is not null
      and source_attribution_id is null
      and granted_by_admin_id is null
      and amount_cents < 0)
    or (reason = 'admin_adjust'
      and granted_by_admin_id is not null
      and source_attribution_id is null
      and source_commitment_id is null)
  )
);

-- Idempotency: cron retries on the lot-settle-success path must not double
-- credit. Exactly one referral_earned row per attribution.
create unique index if not exists idx_credit_ledger_referral_earned_unique
  on public.credit_ledger (source_attribution_id)
  where reason = 'referral_earned' and source_attribution_id is not null;

-- Idempotency: settlement retries on the inviter-settle path must not double
-- debit. Exactly one commit_applied row per commitment.
create unique index if not exists idx_credit_ledger_commit_applied_unique
  on public.credit_ledger (source_commitment_id)
  where reason = 'commit_applied' and source_commitment_id is not null;

-- Powers balance reads and ledger-history disclosure.
create index if not exists idx_credit_ledger_user
  on public.credit_ledger (user_id, created_at desc);

create or replace function public.credit_balance_cents(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount_cents), 0)::integer
  from public.credit_ledger
  where user_id = p_user_id;
$$;

alter table public.credit_ledger enable row level security;

create policy credit_ledger_select_self on public.credit_ledger
  for select
  using (user_id = auth.uid());

-- No insert / update / delete policies. All writes are service-role from
-- settle-deadlines, post-charge handlers, and the admin grant route.

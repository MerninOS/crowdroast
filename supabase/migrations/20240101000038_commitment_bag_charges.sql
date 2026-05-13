-- Bag-aware campaign close: per-bag charge ledger (charge-on-fill model).
--
-- WHAT THIS TABLE IS
-- One row per (buyer, completed bag). Each row is a single Stripe charge the
-- system will attempt against the buyer's saved payment method at settlement.
-- Unlike the legacy model — which charged at commit and refunded at settle —
-- the new model defers all charging to settlement and only ever charges for
-- kg that landed in a *completed* bag. kg in unfilled bags are never charged,
-- so there is nothing to refund (which is why the matching cleanup task
-- considered dropping `commitments.kg_refunded_at_settlement` — see below).
--
-- WHEN ROWS ARE CREATED
-- Exclusively at settlement (`lib/settle-attribution.ts` Task 4.5), after
-- `assignKgToBags` resolves which of each buyer's kg belong to which bag.
-- The settlement code inserts one row per (commitment_id, bag_number) for
-- every COMPLETED bag the buyer contributed to. Rows for incomplete bags are
-- never created. Idempotency is enforced by the UNIQUE(commitment_id,
-- bag_number) constraint plus the UNIQUE(stripe_idempotency_key) — a retried
-- settle-deadlines run can safely upsert.
--
-- PAYMENT_STATUS LIFECYCLE
--   awaiting_charge   Row created by settlement, charge worker has not yet
--                     attempted Stripe. Initial state for every new row.
--   charging          The charge worker has flipped the row and is currently
--                     calling Stripe. Transient. A crashed worker leaves
--                     rows here; the next tick's WHERE-clause-with-lock will
--                     re-pick them up because the deterministic idempotency
--                     key makes a re-attempt safe.
--   charged           Stripe returned success. Terminal-success. The matching
--                     stripe_payment_intent_id is populated.
--   retry_scheduled   Stripe declined. attempt_count incremented, next_attempt_at
--                     set per the 0 / 12h / 48h retry ladder (AC13). The worker
--                     re-picks this row up after next_attempt_at passes.
--   payment_failed    Three attempts exhausted (AC14). Terminal-failure. Surfaces
--                     on the ops dashboard (Task 4.10) for manual remediation.
--
-- WHY kg_refunded_at_settlement IS LEFT ALONE
-- The plan permits an optional DROP of `commitments.kg_refunded_at_settlement`
-- (added in migration #35) because the charge-on-fill model never charges
-- unfilled kg — there is no refund. However, that column is currently
-- referenced by `lib/types.ts` and five `__tests__` files. Dropping it here
-- would break the build before Task 4.5 lands the matching code/test changes.
-- It is deliberately left in place; a future migration after Stage 4 can drop
-- it once those readers are removed.

create table if not exists public.commitment_bag_charges (
  id uuid primary key default gen_random_uuid(),
  commitment_id uuid not null references public.commitments(id) on delete cascade,
  bag_number integer not null check (bag_number >= 1),
  kg integer not null check (kg > 0),
  amount_cents integer not null check (amount_cents > 0),
  stripe_payment_intent_id text,
  stripe_idempotency_key text not null unique,
  payment_status text not null default 'awaiting_charge'
    check (payment_status in (
      'awaiting_charge', 'charging', 'charged', 'retry_scheduled', 'payment_failed'
    )),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz,
  failed_reason text,
  payment_update_email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commitment_bag_charges_commitment_bag_unique
    unique (commitment_id, bag_number)
);

comment on table public.commitment_bag_charges is
  'Per-buyer × per-completed-bag charge ledger for the bag-aware (charge-on-fill) settlement model. One row per (commitment, bag_number). Created at settlement; only for COMPLETED bags. Drives the charge worker retry ladder (AC13) and the ops failed-payments dashboard (AC14).';

comment on column public.commitment_bag_charges.bag_number is
  '1-indexed bag position within the campaign (Bag 1, Bag 2, ...). Combined with commitment_id, uniquely identifies the buyer''s contribution to one bag.';

comment on column public.commitment_bag_charges.kg is
  'Buyer''s kg contribution to this specific bag, from assignKgToBags. Always >0; rows are never created for zero-kg contributions or for incomplete bags.';

comment on column public.commitment_bag_charges.amount_cents is
  'Buyer-paid amount in cents for this bag-portion (kg × tier-resolved price-per-kg, plus platform fee). Hub / seller / platform shares are derived at transfer-out time (Task 4.11) and not stored here.';

comment on column public.commitment_bag_charges.stripe_payment_intent_id is
  'Populated by the charge worker after the first Stripe attempt succeeds (or returns an idempotency-replay of an earlier success). NULL while awaiting_charge.';

comment on column public.commitment_bag_charges.stripe_idempotency_key is
  'Deterministic key of the form charge:campaign:<id>:commitment:<id>:bag:<n>. Stable across retries so a re-run of the worker against the same row cannot double-charge.';

comment on column public.commitment_bag_charges.payment_status is
  'Charge lifecycle: awaiting_charge → charging → charged | retry_scheduled → charging → charged | payment_failed. See file header for full semantics.';

comment on column public.commitment_bag_charges.attempt_count is
  'Number of Stripe attempts made so far. Retry ladder caps at 3 (AC13).';

comment on column public.commitment_bag_charges.next_attempt_at is
  'When the charge worker should re-pick this row up. NULL when no retry is queued (either no attempt has been made yet, or the row is in a terminal state).';

comment on column public.commitment_bag_charges.failed_reason is
  'Latest Stripe decline code or our wrapper error string. Cleared/overwritten on each retry; the row''s charge history (if needed) is recoverable via Stripe.';

comment on column public.commitment_bag_charges.payment_update_email_sent_at is
  'Idempotency marker for the AC13 "update your card" email sent between attempts 2 and 3. NULL means the email has not been sent for this row yet.';

-- INDEXES
-- (payment_status, next_attempt_at) supports the charge worker's queue query:
--   WHERE payment_status IN ('awaiting_charge','retry_scheduled')
--     AND (next_attempt_at IS NULL OR next_attempt_at <= now())
--   ORDER BY next_attempt_at NULLS FIRST
-- The composite is ordered with payment_status first so the partial-set of
-- workable statuses is pruned cheaply before the timestamp scan.
create index if not exists idx_commitment_bag_charges_worker_queue
  on public.commitment_bag_charges (payment_status, next_attempt_at);

-- (commitment_id, bag_number) supports buyer dashboards listing a single
-- commitment's bag rows in order. The UNIQUE constraint above already creates
-- a backing index on this pair, so no separate index is needed.

-- ROW LEVEL SECURITY
-- Follows the existing buyer/seller pattern from the original commitments
-- table (migration #1, public.commitments policies):
--   * Buyers see their own rows via commitment_id → commitments.buyer_id.
--   * Sellers see their lot's rows via commitment_id → commitments.lot_id →
--     lots.seller_id.
-- There is no admin-role RLS policy in this codebase — admin reads/writes go
-- through service-role-keyed API routes (see lib/auth/admin.ts and the
-- admin layout gate). Service-role bypasses RLS, so no policy needed.
-- There are NO INSERT / UPDATE / DELETE policies for buyer or seller. Only
-- the settlement code, charge worker, and ops dashboard (all service-role)
-- write to this table. Matches the credit_ledger pattern (migration #30).
alter table public.commitment_bag_charges enable row level security;

create policy "bag_charges_select_buyer" on public.commitment_bag_charges
  for select
  using (
    commitment_id in (
      select id from public.commitments where buyer_id = auth.uid()
    )
  );

create policy "bag_charges_select_seller" on public.commitment_bag_charges
  for select
  using (
    commitment_id in (
      select id from public.commitments
      where lot_id in (
        select id from public.lots where seller_id = auth.uid()
      )
    )
  );

-- UPDATED_AT TRIGGER
-- This codebase does not have a generic moddatetime helper; existing tables
-- set updated_at inline at every write site. With this table written from
-- four distinct codepaths (settle-attribution, charge-worker, ops dashboard
-- actions, transfer-out), a trigger is the safer invariant. Scoped to this
-- table only to stay consistent with the codebase's "one function per use"
-- migration style.
create or replace function public.tg_commitment_bag_charges_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.commitment_bag_charges;

create trigger set_updated_at
  before update on public.commitment_bag_charges
  for each row
  execute function public.tg_commitment_bag_charges_set_updated_at();

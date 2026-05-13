-- Bag-aware campaign close: ops_actions audit log (Task 4.10a).
--
-- WHAT THIS TABLE IS
-- An append-only, immutable audit log of manual remediation actions taken by
-- ops/admin users. Each row is one action — who did it, what they targeted,
-- what kind of action it was, and any free-form rationale or structured
-- metadata captured at write time. Rows are never updated or deleted (no
-- updated_at column, no UPDATE/DELETE policies). The history of a single
-- target is the time-ordered sequence of its rows.
--
-- WHY IT EXISTS NOW
-- AC14 requires an ops dashboard for failed bag charges (commitment_bag_charges
-- in payment_failed state) with four manual remediation paths: retry the
-- charge, mark the missing amount covered by the platform, mark it covered by
-- the hub, or cancel the buyer's bag-portion entirely. Each of those is a
-- real-money decision and must be auditable forever — who made the call,
-- when, and why. Task 4.0's investigation confirmed no audit table exists in
-- this codebase (credit_ledger is financial-only; commitments.payment_error
-- is single-text-field, not history). This table is the first generic audit
-- surface.
--
-- POLYMORPHIC TARGET BY CONVENTION
-- target_id is a UUID with no FK; target_type names the semantic table it
-- points at. For Task 4.10b only 'commitment_bag_charge' is supported (rows
-- in public.commitment_bag_charges, migration #38). Future ops surfaces can
-- add new target_type values without touching the schema — keeps the audit
-- log open-ended without a join-explosion of one-FK-per-target-table. The
-- tradeoff: no DB-level referential integrity on target_id. That is acceptable
-- because audit rows must survive even if the target row is deleted; an
-- orphaned audit pointer is the desired behavior, not a defect.
--
-- ACTION KINDS (matches AC14's four remediation paths)
--   retry_charge                Ops asked the charge worker to attempt this
--                               commitment_bag_charge again. Writes typically
--                               flip the row's payment_status back to
--                               'retry_scheduled' with next_attempt_at = now.
--   mark_covered_by_platform    Ops decided the platform eats the missing
--                               amount. The bag still ships; this row records
--                               the decision. metadata.amount_covered_cents
--                               captures the dollar exposure.
--   mark_covered_by_hub         Same as platform-cover but the hub eats it.
--                               Typically agreed verbally with the hub owner
--                               before the action; the rationale lives in
--                               notes.
--   cancel_bag_portion          Ops decided this buyer's bag-portion is not
--                               recoverable and the bag will ship short.
--                               This is the most consequential action and
--                               should always have a non-NULL notes field
--                               explaining why no cover was applied.
--
-- IMMUTABILITY
-- No updated_at. No UPDATE or DELETE policies. The credit_ledger pattern
-- (migration #30) is the closest analog — same shape, same insert-only
-- discipline. If a fact about a row turns out to be wrong, the correction is
-- a new row, not a mutation.
--
-- ROW LEVEL SECURITY
-- RLS is enabled with NO policies for non-admin users. Admin access in this
-- codebase is granted via service-role-keyed API routes (see
-- lib/auth/admin.ts and the admin layout gate), and the service role bypasses
-- RLS. Matches the commitment_bag_charges (migration #38) pattern: no admin
-- RLS policy because admin access is service-role keyed.

create table if not exists public.ops_actions (
  id uuid primary key default gen_random_uuid(),
  -- The ops user who performed the action (admin profile id). Restricted on
  -- delete so we can never lose attribution of a real-money decision.
  performed_by uuid not null references public.profiles(id) on delete restrict,
  -- What kind of action this row records. Enumerates the AC14 failed-payment
  -- remediation paths today; new kinds can be added as future ops surfaces
  -- emerge by extending this CHECK in a follow-up migration.
  action_kind text not null check (action_kind in (
    'retry_charge',
    'mark_covered_by_platform',
    'mark_covered_by_hub',
    'cancel_bag_portion'
  )),
  -- Polymorphic-by-convention pointer (no FK). target_type names the table
  -- being pointed at; for now only 'commitment_bag_charge' is in use.
  target_id uuid not null,
  target_type text not null,
  -- Free-form rationale from the ops user. Required by code (not DB) for
  -- cancel_bag_portion; otherwise optional.
  notes text,
  -- Structured payload for the action. e.g. { "amount_covered_cents": 4500 }
  -- on a cover action, or { "stripe_idempotency_key": "..." } on a retry.
  -- Default '{}' so callers never have to think about it for trivial actions.
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.ops_actions is
  'Immutable audit log of manual remediation actions taken by ops/admin users. One row per action. Polymorphic target via (target_type, target_id). First consumer: AC14 failed-payment remediation against commitment_bag_charges. No UPDATE/DELETE — corrections are new rows.';

comment on column public.ops_actions.performed_by is
  'Admin profile id of the ops user who took the action. References public.profiles(id) with ON DELETE RESTRICT so we never lose attribution.';

comment on column public.ops_actions.action_kind is
  'What the ops user did. Enumerated set covers AC14''s four failed-payment remediation paths (retry / cover-by-platform / cover-by-hub / cancel). Extend the CHECK in a follow-up migration when adding new ops surfaces.';

comment on column public.ops_actions.target_id is
  'UUID of the row being acted on. No FK — pairs with target_type to form a polymorphic-by-convention reference, and we deliberately let audit rows outlive their targets.';

comment on column public.ops_actions.target_type is
  'Semantic type name of the target table. Currently only ''commitment_bag_charge'' is in use (rows in public.commitment_bag_charges). New target types can be added without a schema change.';

comment on column public.ops_actions.notes is
  'Free-form rationale from the ops user. Strongly recommended for cancel_bag_portion since that action ships a bag short with no cover.';

comment on column public.ops_actions.metadata is
  'Structured payload for the action (e.g. { "amount_covered_cents": 4500 } on a cover). Defaults to ''{}'' so trivial actions need not populate it.';

-- INDEXES

-- "Show the action history for this failed payment." The ops dashboard
-- (Task 4.10b) renders the audit trail per commitment_bag_charges row. Filter
-- by (target_type, target_id), order by created_at DESC.
create index if not exists idx_ops_actions_target
  on public.ops_actions (target_type, target_id, created_at desc);

-- "What has this admin done lately." Compliance/audit query — given an admin
-- profile id, list their recent actions in reverse chronological order.
create index if not exists idx_ops_actions_performed_by
  on public.ops_actions (performed_by, created_at desc);

-- "How often are we hitting each remediation path." Operational reporting —
-- count cover-by-platform vs cover-by-hub vs cancel over a window, etc.
create index if not exists idx_ops_actions_action_kind
  on public.ops_actions (action_kind, created_at desc);

-- ROW LEVEL SECURITY
-- Enabled, no policies. Admin reads/writes go through service-role-keyed API
-- routes (lib/auth/admin.ts), and service-role bypasses RLS. Matches the
-- commitment_bag_charges (migration #38) admin-access pattern.
alter table public.ops_actions enable row level security;

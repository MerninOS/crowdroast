-- Buyer referral invites: one row per invitee on their first charge_succeeded
-- commitment, recording who referred them and which commitment qualified.
-- This is a pure attribution-event record — money lives in credit_ledger, not
-- here. Status flips pending -> earned at lot-settle-success or pending ->
-- voided at lot-fail.
--
-- See spec: ~/Documents/crowdroast/buyer-referral-invites/spec.md

create table if not exists public.referral_attributions (
  id uuid primary key default gen_random_uuid(),
  inviter_user_id uuid not null references public.profiles(id) on delete cascade,
  invitee_user_id uuid not null references public.profiles(id) on delete cascade,
  commitment_id uuid not null references public.commitments(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','earned','voided')),
  earned_at timestamptz null,
  created_at timestamptz not null default now(),

  -- Locks first inviter (criterion 13): an invitee can only ever earn a
  -- credit for one inviter, the first one whose link they used.
  unique (invitee_user_id),

  -- One attribution per commitment (criterion 7 idempotency).
  unique (commitment_id)
);

-- Powers GET /api/referrals/me list view, filtered by status.
create index if not exists idx_referral_attributions_inviter
  on public.referral_attributions (inviter_user_id, status);

-- Powers lot-settle / lot-fail batch updates.
create index if not exists idx_referral_attributions_campaign_status
  on public.referral_attributions (campaign_id, status);

alter table public.referral_attributions enable row level security;

create policy referral_attributions_select_inviter on public.referral_attributions
  for select
  using (inviter_user_id = auth.uid());

-- No insert / update / delete policies. All writes are service-role from the
-- charge-success handler, the lot-settle cron, and the lot-fail cron.

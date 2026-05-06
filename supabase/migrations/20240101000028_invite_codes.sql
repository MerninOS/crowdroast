-- Buyer referral invites: one persistent invite code per buyer, snapshotting
-- the hub the buyer was in at the time the code was generated. The hub_id is
-- intentionally not updated if the inviter later changes hubs — the link
-- continues to deliver invitees to the original hub.
--
-- See spec: ~/Documents/crowdroast/buyer-referral-invites/spec.md

create table if not exists public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  inviter_user_id uuid not null references public.profiles(id) on delete cascade,
  hub_id uuid not null references public.hubs(id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz null
);

-- One active code per inviter so POST /api/invite-codes is idempotent without
-- a code-uniqueness race. Revoked rows are excluded so a future v2 can replace
-- a code without dropping history.
create unique index if not exists idx_invite_codes_inviter_active
  on public.invite_codes (inviter_user_id)
  where revoked_at is null;

-- Fast public lookup for the landing page.
create index if not exists idx_invite_codes_code_active
  on public.invite_codes (code)
  where revoked_at is null;

alter table public.invite_codes enable row level security;

create policy invite_codes_select_self on public.invite_codes
  for select
  using (inviter_user_id = auth.uid());

create policy invite_codes_insert_self on public.invite_codes
  for insert
  with check (inviter_user_id = auth.uid());

-- No update / delete policies. Revocation in v2 will go through service-role.
-- Public landing-page lookup goes through service-role in the route, so no
-- public select policy is required.

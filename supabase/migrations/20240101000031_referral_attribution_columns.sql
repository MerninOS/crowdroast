-- Buyer referral invites: attribution columns on profiles and hub_members,
-- plus a lock-once trigger that enforces "first inviter is locked" at the
-- column level (criterion 13). Also adds referral_signup_email_sent_at as a
-- one-shot idempotency stamp for the dashboard-driven signup notification
-- (see plan open question 1).
--
-- See spec: ~/Documents/crowdroast/buyer-referral-invites/spec.md

alter table public.profiles
  add column if not exists invited_by_user_id uuid null references public.profiles(id) on delete set null;

alter table public.profiles
  add column if not exists invite_code_used text null;

alter table public.profiles
  add column if not exists referral_signup_email_sent_at timestamptz null;

alter table public.hub_members
  add column if not exists invited_by_user_id uuid null references public.profiles(id) on delete set null;

create index if not exists idx_profiles_invited_by
  on public.profiles (invited_by_user_id)
  where invited_by_user_id is not null;

-- Lock-once-written guard: criterion 13. Once invited_by_user_id is non-null,
-- it cannot change — even back to null. Strict by design (see plan open
-- question 3); any future admin-reset path must bypass via service-role.
create or replace function public.guard_invited_by_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.invited_by_user_id is not null
     and new.invited_by_user_id is distinct from old.invited_by_user_id then
    raise exception 'profiles.invited_by_user_id is locked once written';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_invited_by_lock on public.profiles;
create trigger profiles_invited_by_lock
  before update of invited_by_user_id on public.profiles
  for each row execute function public.guard_invited_by_lock();

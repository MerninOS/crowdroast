-- Allow hub_members to be created without a user_id so hub owners can invite
-- people who don't have a CrowdRoast account yet. The invited_email column
-- holds their address; user_id is linked once they sign up.

-- 1. Drop the NOT NULL constraint on user_id
alter table public.hub_members alter column user_id drop not null;

-- 2. Drop the old table-level unique constraint (hub_id, user_id) which
--    doesn't handle nulls correctly for invited rows.
alter table public.hub_members drop constraint if exists hub_members_hub_id_user_id_key;

-- 3. Partial unique index for active members: one membership per user per hub
create unique index if not exists idx_hub_members_unique_user
  on public.hub_members (hub_id, user_id)
  where user_id is not null;

-- 4. Partial unique index for pending invites: one pending invite per email per hub
create unique index if not exists idx_hub_members_unique_invite
  on public.hub_members (hub_id, invited_email)
  where user_id is null and status = 'invited';

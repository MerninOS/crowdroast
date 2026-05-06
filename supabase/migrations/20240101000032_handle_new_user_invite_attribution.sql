-- Buyer referral invites: extend handle_new_user to read raw_user_meta_data
-- .invite_code, look up the referral, write profile attribution columns, and
-- insert an active hub_members row attributed to the inviter.
--
-- The attribution work is wrapped in a sub-block with EXCEPTION so any
-- failure here does NOT block profile creation — profile + email-invite
-- claim must succeed even if the referral attribution fails.
-- (Spec criterion 3 failure case; design note 3.)
--
-- Self-referral check is case-insensitive (criterion 12).
-- profiles.invited_by_user_id is locked-once-written by the trigger added
-- in migration 31, so the IS NULL guard below is belt-and-suspenders.
--
-- See spec: ~/Documents/crowdroast/buyer-referral-invites/spec.md

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Existing logic from migration 19: create the profile.
  insert into public.profiles (id, role, company_name, contact_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'role', 'buyer'),
    coalesce(new.raw_user_meta_data ->> 'company_name', null),
    coalesce(new.raw_user_meta_data ->> 'contact_name', null),
    new.email
  )
  on conflict (id) do nothing;

  -- Existing logic from migration 19: claim pending email-based hub invites.
  update public.hub_members
  set
    user_id   = new.id,
    status    = 'active',
    joined_at = now()
  where
    invited_email = new.email
    and user_id is null
    and status = 'invited'
    and hub_id not in (
      select hub_id
      from public.hub_members
      where user_id = new.id
        and status = 'active'
    );

  -- New: buyer-referral attribution. Wrapped in its own sub-block so any
  -- failure (invalid invite, FK violation, anything) does not bubble up
  -- and block profile creation above.
  declare
    v_invite_code text;
    v_invite_id uuid;
    v_invite_inviter_user_id uuid;
    v_invite_hub_id uuid;
    v_invite_revoked_at timestamptz;
    v_inviter_email text;
    v_is_self_referral boolean;
  begin
    v_invite_code := nullif(new.raw_user_meta_data ->> 'invite_code', '');

    if v_invite_code is not null then
      select id, inviter_user_id, hub_id, revoked_at
        into v_invite_id, v_invite_inviter_user_id, v_invite_hub_id, v_invite_revoked_at
        from public.invite_codes
        where code = v_invite_code
        limit 1;

      if v_invite_id is not null and v_invite_revoked_at is null then
        select email into v_inviter_email
          from public.profiles
          where id = v_invite_inviter_user_id;

        v_is_self_referral := lower(coalesce(v_inviter_email, '')) = lower(coalesce(new.email, ''));

        -- Always insert an active hub_members row (criteria 3 + 12). On a
        -- self-referral, omit the invited_by_user_id attribution but still
        -- onboard the user — they joined CrowdRoast either way.
        -- The hub_members uniqueness constraint relevant here is the partial
        -- index idx_hub_members_unique_user on (hub_id, user_id) where
        -- user_id is not null. The one-hub-per-buyer index
        -- idx_hub_members_one_active_per_buyer on user_id where status =
        -- 'active' is also relevant but ON CONFLICT can only target one
        -- arbiter, so we take that one — if the user is already active in
        -- a different hub (via step-2 email-invite claim), the insert
        -- raises and the surrounding EXCEPTION block swallows it.
        insert into public.hub_members (hub_id, user_id, status, role, joined_at, invited_by_user_id)
        values (
          v_invite_hub_id,
          new.id,
          'active',
          'buyer',
          now(),
          case when v_is_self_referral then null
               else v_invite_inviter_user_id end
        )
        on conflict (user_id) where status = 'active' do nothing;

        -- Only stamp profile attribution columns when NOT a self-referral.
        -- The where invited_by_user_id is null clause is belt-and-suspenders
        -- alongside the lock-once trigger from migration 31.
        if not v_is_self_referral then
          update public.profiles
            set invited_by_user_id = v_invite_inviter_user_id,
                invite_code_used = v_invite_code
            where id = new.id
              and invited_by_user_id is null;
        end if;
      end if;
    end if;
  exception
    when others then
      raise warning 'handle_new_user invite-attribution failed: %', sqlerrm;
  end;

  return new;
end;
$$;

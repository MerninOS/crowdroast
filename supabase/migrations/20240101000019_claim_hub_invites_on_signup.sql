-- When a new user signs up, automatically claim any hub_members rows that were
-- created as pending invites for their email address. This converts the invited
-- rows (user_id = null, status = 'invited') to active memberships linked to the
-- new user's profile id.
--
-- We update the handle_new_user trigger function to include this logic so it
-- runs atomically with profile creation — no extra API calls needed.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Create the profile
  insert into public.profiles (id, role, company_name, contact_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'role', 'buyer'),
    coalesce(new.raw_user_meta_data ->> 'company_name', null),
    coalesce(new.raw_user_meta_data ->> 'contact_name', null),
    new.email
  )
  on conflict (id) do nothing;

  -- Claim any pending hub invites for this email. Skip hubs where the user
  -- is already an active member (shouldn't happen, but guards the unique index).
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

  return new;
end;
$$;

-- Admin-managed onboarding for sellers and hub owners
-- Stage 2: role requests + invitations, and buyer-only self-signup.

create table if not exists public.role_access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  requested_role text not null check (requested_role in ('seller', 'hub_owner')),
  company_name text,
  contact_name text,
  phone text,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists role_access_requests_user_id_idx on public.role_access_requests(user_id);
create index if not exists role_access_requests_status_idx on public.role_access_requests(status);

alter table public.role_access_requests enable row level security;

create policy "role_requests_select_own"
on public.role_access_requests
for select
using (auth.uid() = user_id);

create policy "role_requests_insert_own"
on public.role_access_requests
for insert
with check (auth.uid() = user_id);

create policy "role_requests_update_own_pending"
on public.role_access_requests
for update
using (auth.uid() = user_id and status = 'pending')
with check (auth.uid() = user_id and status = 'pending');

create table if not exists public.role_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  target_role text not null check (target_role in ('seller', 'hub_owner')),
  invited_by uuid not null references public.profiles(id),
  company_name text,
  contact_name text,
  message text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists role_invitations_email_idx on public.role_invitations(email);
create index if not exists role_invitations_status_idx on public.role_invitations(status);

alter table public.role_invitations enable row level security;

-- Invitations are managed through server routes with service-role auth.
-- Keep RLS enabled with no public policies.

-- Harden signup profile creation so public signup always starts as buyer.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, company_name, contact_name, email)
  values (
    new.id,
    'buyer',
    coalesce(new.raw_user_meta_data ->> 'company_name', null),
    coalesce(new.raw_user_meta_data ->> 'contact_name', null),
    new.email
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

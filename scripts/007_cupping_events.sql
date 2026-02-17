-- Cupping events: one event can include multiple requested samples
create table if not exists public.cupping_events (
  id uuid primary key default gen_random_uuid(),
  hub_id uuid not null references public.hubs(id) on delete cascade,
  host_id uuid not null references public.profiles(id) on delete cascade,
  scheduled_at timestamptz not null,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.cupping_event_samples (
  id uuid primary key default gen_random_uuid(),
  cupping_event_id uuid not null references public.cupping_events(id) on delete cascade,
  sample_request_id uuid not null references public.sample_requests(id) on delete cascade,
  created_at timestamptz default now(),
  unique(cupping_event_id, sample_request_id)
);

create index if not exists idx_cupping_events_hub_scheduled
  on public.cupping_events (hub_id, scheduled_at);
create index if not exists idx_cupping_event_samples_event
  on public.cupping_event_samples (cupping_event_id);

alter table public.cupping_events enable row level security;
alter table public.cupping_event_samples enable row level security;

-- Event visibility for host, hub owner, and active buyers in the hub.
create policy "cupping_events_select_hub_flow" on public.cupping_events
for select using (
  auth.uid() = host_id
  or auth.uid() in (
    select owner_id from public.hubs where id = cupping_events.hub_id
  )
  or auth.uid() in (
    select user_id from public.hub_members
    where hub_id = cupping_events.hub_id
      and status = 'active'
  )
);

-- Only the hub owner can create/update/delete events for their hub.
create policy "cupping_events_insert_owner" on public.cupping_events
for insert with check (
  auth.uid() = host_id
  and auth.uid() in (
    select owner_id from public.hubs where id = cupping_events.hub_id
  )
);

create policy "cupping_events_update_owner" on public.cupping_events
for update using (
  auth.uid() in (
    select owner_id from public.hubs where id = cupping_events.hub_id
  )
);

create policy "cupping_events_delete_owner" on public.cupping_events
for delete using (
  auth.uid() in (
    select owner_id from public.hubs where id = cupping_events.hub_id
  )
);

-- Event-sample links are visible to anyone who can view the event.
create policy "cupping_event_samples_select_hub_flow" on public.cupping_event_samples
for select using (
  auth.uid() in (
    select host_id
    from public.cupping_events
    where id = cupping_event_samples.cupping_event_id
  )
  or auth.uid() in (
    select owner_id
    from public.hubs
    where id in (
      select hub_id from public.cupping_events where id = cupping_event_samples.cupping_event_id
    )
  )
  or auth.uid() in (
    select user_id
    from public.hub_members
    where status = 'active'
      and hub_id in (
        select hub_id from public.cupping_events where id = cupping_event_samples.cupping_event_id
      )
  )
);

-- Only hub owner can add/remove coffees to/from events.
create policy "cupping_event_samples_insert_owner" on public.cupping_event_samples
for insert with check (
  auth.uid() in (
    select owner_id
    from public.hubs
    where id in (
      select hub_id from public.cupping_events where id = cupping_event_samples.cupping_event_id
    )
  )
);

create policy "cupping_event_samples_delete_owner" on public.cupping_event_samples
for delete using (
  auth.uid() in (
    select owner_id
    from public.hubs
    where id in (
      select hub_id from public.cupping_events where id = cupping_event_samples.cupping_event_id
    )
  )
);

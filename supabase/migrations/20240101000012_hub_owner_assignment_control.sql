-- Stage 4: hub owners cannot self-create hubs; admin assigns hubs.

-- Remove self-serve hub creation.
drop policy if exists "hubs_insert_owner" on public.hubs;

-- Prevent assigning multiple hubs to the same owner for new inserts.
create or replace function public.enforce_single_hub_per_owner()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from public.hubs h
    where h.owner_id = new.owner_id
      and h.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) then
    raise exception 'This hub owner already has an assigned hub';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_single_hub_per_owner on public.hubs;

create trigger trg_single_hub_per_owner
before insert or update on public.hubs
for each row
execute function public.enforce_single_hub_per_owner();

-- Auto-create profile on signup
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
    coalesce(new.raw_user_meta_data ->> 'role', 'buyer'),
    coalesce(new.raw_user_meta_data ->> 'company_name', null),
    coalesce(new.raw_user_meta_data ->> 'contact_name', null),
    new.email
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Function to update committed quantity on lots when commitments change
create or replace function public.update_lot_committed_quantity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.lots
  set committed_quantity_kg = (
    select coalesce(sum(quantity_kg), 0)
    from public.commitments
    where lot_id = coalesce(new.lot_id, old.lot_id)
    and status not in ('cancelled')
  ),
  status = case
    when (
      select coalesce(sum(quantity_kg), 0)
      from public.commitments
      where lot_id = coalesce(new.lot_id, old.lot_id)
      and status not in ('cancelled')
    ) >= total_quantity_kg then 'fully_committed'
    else 'active'
  end,
  updated_at = now()
  where id = coalesce(new.lot_id, old.lot_id);

  return coalesce(new, old);
end;
$$;

drop trigger if exists on_commitment_change on public.commitments;

create trigger on_commitment_change
  after insert or update or delete on public.commitments
  for each row
  execute function public.update_lot_committed_quantity();

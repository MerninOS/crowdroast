-- Persist event timezone so UI always renders the scheduled local time correctly.
alter table public.cupping_events
  add column if not exists timezone text not null default 'UTC';

-- Backfill existing rows where timezone may be empty.
update public.cupping_events
set timezone = 'UTC'
where timezone is null or btrim(timezone) = '';

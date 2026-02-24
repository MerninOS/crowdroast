-- Stage 5: store platform payout destination account in DB for cron settlement.

create table if not exists public.platform_settings (
  id integer primary key default 1 check (id = 1),
  platform_connect_account_id text,
  updated_at timestamptz default now()
);

alter table public.platform_settings enable row level security;

-- No public policies; managed via server routes with service-role access.

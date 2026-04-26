-- Marker table tracking dev-environment seed runs.
-- Used by scripts/seed-test-env.ts to record start/completion of seed
-- operations so we can detect partial / failed runs and provide a
-- consistent signal that the canonical cast is in place.
--
-- Not used in production. The table exists in prod's schema after this
-- migration applies, but no production code reads or writes to it.

create extension if not exists "uuid-ossp";

create table if not exists public._seed_runs (
  id uuid primary key default uuid_generate_v4(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null check (status in ('running', 'completed', 'failed'))
);

comment on table public._seed_runs is
  'Tracks dev-environment seed runs (scripts/seed-test-env.ts). Not used in prod.';

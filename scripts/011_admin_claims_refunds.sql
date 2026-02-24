-- Stage 3: admin claims oversight and manual refund tracking.

alter table public.commitments
  add column if not exists refund_status text not null default 'not_refunded'
    check (refund_status in ('not_refunded', 'partial', 'full', 'failed')),
  add column if not exists refunded_amount_cents integer not null default 0,
  add column if not exists refunded_at timestamptz,
  add column if not exists refunded_by uuid references public.profiles(id),
  add column if not exists last_refund_id text,
  add column if not exists refund_reason text;

create index if not exists idx_commitments_refund_status on public.commitments(refund_status);

alter table public.claims
  add column if not exists handled_by uuid references public.profiles(id),
  add column if not exists handled_at timestamptz;

create index if not exists idx_claims_status_created_at on public.claims(status, created_at desc);

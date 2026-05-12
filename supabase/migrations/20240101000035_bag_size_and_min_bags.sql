-- Bag-aware campaign close: schema additions.
--
-- Adds the bag dimensions a campaign settles on:
--   * lots.bag_size_kg          — physical bag size for this lot (e.g. 60kg).
--                                 Nullable: existing lots are pre-bag and must
--                                 be backfilled by the seller before any new
--                                 commitments are accepted (see Task 1.9).
--   * lots.min_bags_to_succeed  — minimum completed bags required for the
--                                 campaign to settle; below this the campaign
--                                 fails and every commitment is fully refunded.
--
-- Adds settlement bookkeeping on commitments. These columns are NULL until
-- settlement runs `assignKgToBags` and decides each commit's fate:
--   * commitments.kg_locked_at_settlement   — kg the buyer actually purchased.
--   * commitments.kg_refunded_at_settlement — kg returned to the buyer because
--                                             they landed in an unfilled bag.
--
-- Note on refund_status: a `refund_status` column already exists on
-- commitments (migration 20240101000011, admin manual refund flow) with
-- domain ('not_refunded', 'partial', 'full', 'failed') and a NOT NULL
-- default of 'not_refunded'. Rather than introduce a parallel column, we
-- widen the existing CHECK to also allow the settlement-driven values
-- 'pending' (refund queued during settle) and 'complete' (Stripe partial
-- refund confirmed). This keeps a single column of truth for refund state.

alter table public.lots
  add column if not exists bag_size_kg integer
    check (bag_size_kg is null or (bag_size_kg between 1 and 100)),
  add column if not exists min_bags_to_succeed integer not null default 1
    check (min_bags_to_succeed >= 1);

comment on column public.lots.bag_size_kg is
  'Physical bag size in kg for this campaign. NULL = legacy lot that needs seller backfill before commits are accepted.';

comment on column public.lots.min_bags_to_succeed is
  'Minimum completed bags required for the campaign to settle successfully. Below this, the campaign fails and all commitments are fully refunded.';

alter table public.commitments
  add column if not exists kg_locked_at_settlement integer,
  add column if not exists kg_refunded_at_settlement integer;

comment on column public.commitments.kg_locked_at_settlement is
  'kg the buyer actually purchased after bag-aware settlement (NULL pre-settlement).';

comment on column public.commitments.kg_refunded_at_settlement is
  'kg refunded to the buyer because they landed in an unfilled bag (NULL pre-settlement).';

-- Widen refund_status to include the settlement lifecycle values without
-- disturbing the existing admin-refund domain.
alter table public.commitments
  drop constraint if exists commitments_refund_status_check;

alter table public.commitments
  add constraint commitments_refund_status_check
    check (refund_status in ('not_refunded', 'pending', 'partial', 'full', 'complete', 'failed'));

comment on column public.commitments.refund_status is
  'Refund lifecycle. Admin manual paths: not_refunded (default) | partial | full | failed. Bag-aware settlement paths: pending (refund queued) | complete (Stripe partial refund confirmed) | failed.';

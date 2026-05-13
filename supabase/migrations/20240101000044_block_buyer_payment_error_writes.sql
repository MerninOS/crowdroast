-- B1 security fix (re-design): trigger-based protection of payment_error.
--
-- BACKGROUND
-- Original B1 finding (PR #78 code review): a buyer can self-modify
-- `commitments.payment_error` via supabase-js to skip charging — the charge
-- worker treats `payment_error IS NOT NULL` as the "auth probe failed; do not
-- charge" gate.
--
-- Migration #42 tried to fix this with a column-level UPDATE revoke. That
-- broke production because the codebase has multiple legitimate
-- authenticated-session UPDATE paths on commitments that touch
-- payment_error (clearing it to null on retry, syncing Stripe Checkout
-- results, etc.). Migration #43 reverted the revoke.
--
-- WHY A TRIGGER INSTEAD OF GRANTS
-- The attack we care about is *setting payment_error to a non-null value*
-- from the authenticated role. Clearing it (null write) is legitimate —
-- it's how the codebase resets state on retry. A Postgres BEFORE UPDATE
-- trigger gives us conditional rejection: block non-null writes from the
-- authenticated role, allow everything else. Service-role keys (admin
-- routes, webhook handler, charge worker, cron sweepers) bypass.
--
-- SCOPE
-- This trigger only fires on UPDATE OF payment_error — zero overhead on
-- the common-case UPDATE that doesn't touch the column.

create or replace function public.block_buyer_payment_error_set()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service role + anon (cron callback) bypass. Authenticated role is the
  -- only restricted context.
  if auth.role() <> 'authenticated' then
    return new;
  end if;

  -- The attack is *setting* payment_error to a non-null sentinel to spoof
  -- "auth probe failed" and skip the charge worker. Clearing (null write)
  -- is legitimate — it's how the commit route resets state on retry. Only
  -- block when the value is changing to a non-null value.
  if new.payment_error is not null and new.payment_error is distinct from old.payment_error then
    raise exception 'payment_error can only be set to a non-null value by the service role (B1 trigger). Use an admin API route.'
      using errcode = '42501';  -- insufficient_privilege
  end if;

  return new;
end;
$$;

drop trigger if exists block_buyer_payment_error_writes on public.commitments;

create trigger block_buyer_payment_error_writes
  before update of payment_error on public.commitments
  for each row
  execute function public.block_buyer_payment_error_set();

comment on function public.block_buyer_payment_error_set() is
  'B1: blocks authenticated-role UPDATEs that set commitments.payment_error to a non-null value. Service-role bypass via auth.role() check. See migration #44 header.';

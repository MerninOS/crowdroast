alter table public.lots
drop constraint if exists lots_status_check;

alter table public.lots
add constraint lots_status_check
check (status in ('draft', 'active', 'fully_committed', 'shipped', 'delivered', 'closed', 'expired'));

-- Scope shipments to the campaign that produced them.
-- Without this, createShipmentForLot's idempotency check (lot_id + non-cancelled
-- status) finds a stale shipment from a prior campaign cycle and returns it
-- instead of inserting a new pending row. The seller's shipments dashboard
-- then never gets a new entry for the latest settled campaign.

alter table public.shipments
  add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;

-- Backfill: link existing shipments to their lot's most recent settled campaign.
-- distinct on picks the first row per lot after ordering, so we get exactly one
-- campaign per shipment (the latest 'settled' one, falling back to created_at).
update public.shipments s
set campaign_id = c.id
from (
  select distinct on (lot_id) id, lot_id
  from public.campaigns
  where status = 'settled'
  order by lot_id, settled_at desc nulls last, created_at desc
) c
where s.lot_id = c.lot_id
  and s.campaign_id is null;

create index if not exists idx_shipments_lot_campaign
  on public.shipments (lot_id, campaign_id);

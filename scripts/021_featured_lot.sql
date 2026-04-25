-- Add featured_lot_id to hubs so hub owners can spotlight one lot on the buyer dashboard.
-- ON DELETE SET NULL: if a lot is hard-deleted, the reference clears automatically.
-- Campaign expiry is handled at render time — no trigger needed.

ALTER TABLE public.hubs
  ADD COLUMN featured_lot_id UUID REFERENCES public.lots(id) ON DELETE SET NULL;

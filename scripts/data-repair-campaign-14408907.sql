-- Data repair: campaign 14408907-a374-496d-8f07-1c6a6540ff8a
-- ("Andres Martinez Geisha Washed", lot 22d96924-f19f-4255-887a-9536ea8e12cb)
-- was stranded `active` past its deadline by the integer-kg wedge bug.
--
-- See: supabase/migrations/20240101000047_bag_kg_numeric.sql for the root
-- cause. APPLY THAT MIGRATION FIRST — this script inserts a 0.02815 kg
-- bag-charge row, which the pre-migration `integer` column would reject.
--
-- This script replays exactly what the bag-aware branch of
-- app/api/payments/settle-deadlines/route.ts would have done for a 60 kg
-- bag with three chronologically-ordered commitments:
--
--   C1 18585bc4 quantity 9.07185 kg  → bag 1 portion 9.07185 kg
--   C2 9c0a3620 quantity 50.9    kg  → bag 1 portion 50.9    kg
--   C3 53f6d802 quantity 9.07185 kg  → bag 1 portion 0.02815 kg
--                                      (remaining 9.0437 kg is in the
--                                       incomplete bag 2 → dropped, never
--                                       charged — matches charge-on-fill)
--
--   total committed 69.0437 kg → floor(69.0437 / 60) = 1 completed bag
--   bag 1 fills to exactly 9.07185 + 50.9 + 0.02815 = 60.00000 kg
--   completed_bags (1) >= min_bags_to_succeed (1) → SETTLE
--
-- Tier resolution: the only pricing tier (min_bags = 2) does not apply at
-- 1 completed bag, so price_per_kg = lot base 26.46. Buyer-paid amount =
-- round(kg * 26.46 * 1.1 * 100) [price + 10% platform fee], same formula
-- the route uses. Verified against prod: C1 26405, C2 148150, C3 82 cents
-- (C1/C2 also match the commit-time estimates already on the rows).
--
-- After this runs, the rows sit in `awaiting_charge` exactly as a normal
-- settlement would leave them. The existing process-bag-charges cron
-- (02:00 UTC daily) then charges the three saved cards, transfers out to
-- the seller + hub, and fires the per-commitment settlement emails — the
-- normal post-settle flow, fully restored. (The settle-time lot-closed
-- courtesy email is the one side effect this SQL path cannot reproduce;
-- the functional money + shipment flow is unaffected.)
--
-- Run AFTER the migration is applied. Single transaction; idempotent.

BEGIN;

-- 1) Per-bag charge ledger rows (one per commitment, bag 1). ON CONFLICT
--    mirrors the route's upsert(ignoreDuplicates) so a re-run is a no-op.
INSERT INTO commitment_bag_charges
  (commitment_id, bag_number, kg, amount_cents, stripe_idempotency_key, payment_status)
VALUES
  ('18585bc4-d2c8-44c7-9971-23949d0a9c88', 1, 9.07185, 26405,
   'charge:campaign:14408907-a374-496d-8f07-1c6a6540ff8a:commitment:18585bc4-d2c8-44c7-9971-23949d0a9c88:bag:1',
   'awaiting_charge'),
  ('9c0a3620-20e3-4246-87ac-f9c4a368fa58', 1, 50.9, 148150,
   'charge:campaign:14408907-a374-496d-8f07-1c6a6540ff8a:commitment:9c0a3620-20e3-4246-87ac-f9c4a368fa58:bag:1',
   'awaiting_charge'),
  ('53f6d802-d2d0-412d-9d21-d94c65e98ca6', 1, 0.02815, 82,
   'charge:campaign:14408907-a374-496d-8f07-1c6a6540ff8a:commitment:53f6d802-d2d0-412d-9d21-d94c65e98ca6:bag:1',
   'awaiting_charge')
ON CONFLICT (commitment_id, bag_number) DO NOTHING;

-- 2) Stamp kg_locked_at_settlement + flip to confirmed (route does exactly
--    this per commitment after the upsert). payment_status is intentionally
--    left 'setup_complete' — the charge worker reads commitment_bag_charges,
--    not commitments.payment_status.
UPDATE commitments SET kg_locked_at_settlement = 9.07185, status = 'confirmed',
  payment_error = NULL, updated_at = NOW()
WHERE id = '18585bc4-d2c8-44c7-9971-23949d0a9c88' AND status <> 'cancelled';

UPDATE commitments SET kg_locked_at_settlement = 50.9, status = 'confirmed',
  payment_error = NULL, updated_at = NOW()
WHERE id = '9c0a3620-20e3-4246-87ac-f9c4a368fa58' AND status <> 'cancelled';

UPDATE commitments SET kg_locked_at_settlement = 0.02815, status = 'confirmed',
  payment_error = NULL, updated_at = NOW()
WHERE id = '53f6d802-d2d0-412d-9d21-d94c65e98ca6' AND status <> 'cancelled';

-- 3) Shipment row the seller works off of (route fires createShipmentForLot
--    with the sum of locked kg = 60.0). Idempotent on (lot_id, campaign_id).
INSERT INTO shipments (lot_id, hub_id, campaign_id, status, weight_kg)
SELECT '22d96924-f19f-4255-887a-9536ea8e12cb',
       'ccfcda91-1244-4d75-ab05-c7e444001d23',
       '14408907-a374-496d-8f07-1c6a6540ff8a',
       'pending', 60
WHERE NOT EXISTS (
  SELECT 1 FROM shipments
  WHERE lot_id = '22d96924-f19f-4255-887a-9536ea8e12cb'
    AND campaign_id = '14408907-a374-496d-8f07-1c6a6540ff8a'
);

-- 4) Atomically settle the campaign + recycle the lot (same RPC the route
--    calls). No-ops if the campaign is no longer 'active'.
SELECT public.finalize_campaign(
  '14408907-a374-496d-8f07-1c6a6540ff8a'::uuid, 'settled');

-- 5) Sanity checks — fail loudly inside the transaction if anything is off.
DO $$
DECLARE
  v_campaign_status text;
  v_lot_status text;
  v_charge_rows int;
  v_confirmed int;
BEGIN
  SELECT status INTO v_campaign_status FROM campaigns
   WHERE id = '14408907-a374-496d-8f07-1c6a6540ff8a';
  SELECT status INTO v_lot_status FROM lots
   WHERE id = '22d96924-f19f-4255-887a-9536ea8e12cb';
  SELECT count(*) INTO v_charge_rows FROM commitment_bag_charges
   WHERE commitment_id IN (
     '18585bc4-d2c8-44c7-9971-23949d0a9c88',
     '9c0a3620-20e3-4246-87ac-f9c4a368fa58',
     '53f6d802-d2d0-412d-9d21-d94c65e98ca6');
  SELECT count(*) INTO v_confirmed FROM commitments
   WHERE campaign_id = '14408907-a374-496d-8f07-1c6a6540ff8a'
     AND status = 'confirmed';

  IF v_campaign_status <> 'settled' THEN
    RAISE EXCEPTION 'campaign status is % (expected settled)', v_campaign_status;
  END IF;
  IF v_lot_status <> 'awaiting_relist' THEN
    RAISE EXCEPTION 'lot status is % (expected awaiting_relist)', v_lot_status;
  END IF;
  IF v_charge_rows <> 3 THEN
    RAISE EXCEPTION 'expected 3 bag-charge rows, found %', v_charge_rows;
  END IF;
  IF v_confirmed <> 3 THEN
    RAISE EXCEPTION 'expected 3 confirmed commitments, found %', v_confirmed;
  END IF;
END $$;

COMMIT;

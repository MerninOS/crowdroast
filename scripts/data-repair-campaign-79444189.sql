-- Data repair: campaign 79444189-06a4-496e-b7ca-8214c07f1abf was incorrectly
-- marked 'failed' by the settle-deadlines cron. The campaign actually settled
-- successfully — emails and a shipment were created — but one orphan commitment
-- (no stripe_payment_intent_id) inflated `failedCount` and flipped the status.
--
-- See: app/api/payments/settle-deadlines/route.ts (the failedCount = unpaidCount fix).
-- See: app/api/stripe/webhook/route.ts (new failure-event handlers).
--
-- Apply ONLY after deploying the code fix. Run in a single transaction.

BEGIN;

-- 1) Cancel the orphan commitment. The on_commitment_change trigger will
--    decrement lots.committed_quantity_kg from 45.812... to 45.359... (exactly
--    100 lb). After this step, lot.committed_quantity_kg ≥ min_commitment_kg.
UPDATE commitments
SET status = 'cancelled',
    payment_status = 'cancelled',
    payment_error = 'Cancelled retroactively: never completed Stripe Checkout. See data-repair-campaign-79444189.sql.',
    updated_at = NOW()
WHERE id = '3e891a6d-6507-434a-b685-814a95634c59'
  AND status != 'confirmed';

-- 2) Verify the orphan removal actually dropped the lot's committed_quantity_kg
--    (sanity check — fail loudly if the trigger didn't run).
DO $$
DECLARE
  qty numeric;
BEGIN
  SELECT committed_quantity_kg INTO qty
  FROM lots
  WHERE id = 'a33c0b03-28b5-4dfb-b3dc-3e38983d8ef3';
  IF qty < 35 THEN
    RAISE EXCEPTION 'Sanity check failed: lot.committed_quantity_kg=% is below min_commitment_kg after orphan cancel', qty;
  END IF;
END $$;

-- 3) Restore the campaign to its true outcome: settled at the original
--    settlement_processed_at timestamp.
UPDATE campaigns
SET status = 'settled',
    settled_at = '2026-04-26T03:17:27.36+00:00'
WHERE id = '79444189-06a4-496e-b7ca-8214c07f1abf'
  AND status = 'failed';

-- 4) Restore the lot's settlement status (status='closed' is correct as-is).
UPDATE lots
SET settlement_status = 'settled'
WHERE id = 'a33c0b03-28b5-4dfb-b3dc-3e38983d8ef3'
  AND settlement_status = 'failed';

COMMIT;

-- Verification (run AFTER COMMIT to confirm):
-- SELECT id, status, settled_at FROM campaigns WHERE id = '79444189-06a4-496e-b7ca-8214c07f1abf';
-- SELECT id, status, settlement_status, committed_quantity_kg FROM lots WHERE id = 'a33c0b03-28b5-4dfb-b3dc-3e38983d8ef3';
-- SELECT id, status, payment_status FROM commitments WHERE id = '3e891a6d-6507-434a-b685-814a95634c59';

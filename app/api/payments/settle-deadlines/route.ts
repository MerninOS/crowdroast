import { createAdminClient } from "@/lib/supabase/admin";
import {
  createAndConfirmPaymentIntent,
  createTransfer,
} from "@/lib/stripe";
import { NextResponse } from "next/server";

const SELLER_SHARE_BPS = 9000; // 90%
const HUB_SHARE_BPS = 200; // 2%
const TOTAL_BPS = 10000;

function getBearerToken(header: string | null) {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer") return null;
  return token || null;
}

function computeSplit(amountCents: number) {
  const sellerAmount = Math.floor((amountCents * SELLER_SHARE_BPS) / TOTAL_BPS);
  const hubAmount = Math.floor((amountCents * HUB_SHARE_BPS) / TOTAL_BPS);
  const platformAmount = amountCents - sellerAmount - hubAmount;

  return { sellerAmount, hubAmount, platformAmount };
}

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Missing CRON_SECRET" }, { status: 500 });
  }

  const bearer = getBearerToken(request.headers.get("authorization"));
  const headerSecret = request.headers.get("x-cron-secret");
  if (bearer !== cronSecret && headerSecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: dueLots, error: dueLotsError } = await admin
    .from("lots")
    .select(
      "id, seller_id, hub_id, status, currency, committed_quantity_kg, min_commitment_kg, commitment_deadline, settlement_status"
    )
    .lte("commitment_deadline", nowIso)
    .eq("settlement_status", "pending")
    .in("status", ["active", "fully_committed"]);

  if (dueLotsError) {
    return NextResponse.json({ error: dueLotsError.message }, { status: 500 });
  }

  const results: Array<Record<string, unknown>> = [];

  for (const lot of dueLots || []) {
    const minimumMet = Number(lot.committed_quantity_kg) >= Number(lot.min_commitment_kg);

    if (!minimumMet) {
      await admin
        .from("commitments")
        .update({
          status: "cancelled",
          payment_status: "cancelled",
          payment_error: "Lot minimum not met by deadline",
        })
        .eq("lot_id", lot.id)
        .neq("payment_status", "charge_succeeded");

      await admin
        .from("lots")
        .update({
          status: "closed",
          settlement_status: "minimum_not_met",
          settlement_processed_at: nowIso,
        })
        .eq("id", lot.id);

      results.push({ lot_id: lot.id, outcome: "minimum_not_met" });
      continue;
    }

    const { data: sellerProfile } = await admin
      .from("profiles")
      .select("stripe_connect_account_id")
      .eq("id", lot.seller_id)
      .single();

    if (!sellerProfile?.stripe_connect_account_id) {
      await admin
        .from("lots")
        .update({
          settlement_status: "failed",
          settlement_processed_at: nowIso,
        })
        .eq("id", lot.id);

      results.push({
        lot_id: lot.id,
        outcome: "failed",
        error: "Seller is missing stripe_connect_account_id",
      });
      continue;
    }

    if (!lot.hub_id) {
      await admin
        .from("lots")
        .update({
          settlement_status: "failed",
          settlement_processed_at: nowIso,
        })
        .eq("id", lot.id);

      results.push({
        lot_id: lot.id,
        outcome: "failed",
        error: "Lot is missing hub_id",
      });
      continue;
    }

    const { data: hub } = await admin
      .from("hubs")
      .select("owner_id")
      .eq("id", lot.hub_id)
      .single();

    const { data: hubOwnerProfile } = hub?.owner_id
      ? await admin
          .from("profiles")
          .select("stripe_connect_account_id")
          .eq("id", hub.owner_id)
          .single()
      : { data: null };

    if (!hubOwnerProfile?.stripe_connect_account_id) {
      await admin
        .from("lots")
        .update({
          settlement_status: "failed",
          settlement_processed_at: nowIso,
        })
        .eq("id", lot.id);

      results.push({
        lot_id: lot.id,
        outcome: "failed",
        error: "Hub owner is missing stripe_connect_account_id",
      });
      continue;
    }

    const { data: commitments, error: commitmentsError } = await admin
      .from("commitments")
      .select(
        "id, status, payment_status, charge_amount_cents, charge_currency, stripe_customer_id, stripe_payment_method_id"
      )
      .eq("lot_id", lot.id)
      .neq("payment_status", "charge_succeeded");

    if (commitmentsError) {
      results.push({ lot_id: lot.id, outcome: "failed", error: commitmentsError.message });
      continue;
    }

    let failedCount = 0;
    let succeededCount = 0;

    for (const commitment of commitments || []) {
      const amountCents = Number(commitment.charge_amount_cents || 0);
      const currency = (commitment.charge_currency || lot.currency || "usd").toLowerCase();

      if (!commitment.stripe_customer_id || !commitment.stripe_payment_method_id || amountCents <= 0) {
        failedCount += 1;
        await admin
          .from("commitments")
          .update({
            payment_status: "charge_failed",
            payment_error: "Missing payment method, customer, or amount",
          })
          .eq("id", commitment.id);
        continue;
      }

      try {
        const paymentIntent = await createAndConfirmPaymentIntent({
          amountCents,
          currency,
          customerId: commitment.stripe_customer_id,
          paymentMethodId: commitment.stripe_payment_method_id,
          commitmentId: commitment.id,
          lotId: lot.id,
        });

        if (paymentIntent.status !== "succeeded" || !paymentIntent.latest_charge) {
          throw new Error(`Payment intent not succeeded (status: ${paymentIntent.status})`);
        }

        const split = computeSplit(amountCents);

        if (split.sellerAmount > 0) {
          await createTransfer({
            amountCents: split.sellerAmount,
            currency,
            destinationAccountId: sellerProfile.stripe_connect_account_id,
            sourceChargeId: paymentIntent.latest_charge,
            commitmentId: commitment.id,
            role: "seller",
          });
        }

        if (split.hubAmount > 0) {
          await createTransfer({
            amountCents: split.hubAmount,
            currency,
            destinationAccountId: hubOwnerProfile.stripe_connect_account_id,
            sourceChargeId: paymentIntent.latest_charge,
            commitmentId: commitment.id,
            role: "hub",
          });
        }

        await admin
          .from("commitments")
          .update({
            status: "confirmed",
            payment_status: "charge_succeeded",
            stripe_payment_intent_id: paymentIntent.id,
            stripe_charge_id: paymentIntent.latest_charge,
            charged_at: nowIso,
            payment_error: null,
          })
          .eq("id", commitment.id);

        succeededCount += 1;
      } catch (chargeError) {
        failedCount += 1;
        await admin
          .from("commitments")
          .update({
            payment_status: "charge_failed",
            payment_error:
              chargeError instanceof Error ? chargeError.message : "Charge failed",
          })
          .eq("id", commitment.id);
      }
    }

    await admin
      .from("lots")
      .update({
        status: "closed",
        settlement_status: failedCount > 0 ? "failed" : "settled",
        settlement_processed_at: nowIso,
      })
      .eq("id", lot.id);

    results.push({
      lot_id: lot.id,
      outcome: failedCount > 0 ? "failed" : "settled",
      commitments_succeeded: succeededCount,
      commitments_failed: failedCount,
    });
  }

  return NextResponse.json(
    {
      processed_lots: results.length,
      results,
    },
    { status: 200 }
  );
}

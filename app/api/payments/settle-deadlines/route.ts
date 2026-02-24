import { createAdminClient } from "@/lib/supabase/admin";
import { getConfiguredAdminEmail } from "@/lib/auth/admin";
import {
  createRefund,
  createTransfer,
} from "@/lib/stripe";
import {
  computeChargeAdjustment,
  computeSplit,
  getFinalPricePerKg,
} from "@/lib/payments/settlement-logic";
import { NextResponse } from "next/server";

function getBearerToken(header: string | null) {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer") return null;
  return token || null;
}

async function settleDeadlines(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Missing CRON_SECRET" }, { status: 500 });
  }

  const bearer = getBearerToken(request.headers.get("authorization"));
  const headerSecret = request.headers.get("x-cron-secret");
  if (bearer !== cronSecret && headerSecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminEmail = getConfiguredAdminEmail();
  if (!adminEmail) {
    return NextResponse.json(
      { error: "Missing ADMIN_EMAIL for platform payout destination" },
      { status: 500 }
    );
  }

  const admin = createAdminClient();
  const { data: payoutProfiles, error: payoutProfilesError } = await admin
    .from("profiles")
    .select("email, stripe_connect_account_id")
    .not("stripe_connect_account_id", "is", null);

  if (payoutProfilesError) {
    return NextResponse.json({ error: payoutProfilesError.message }, { status: 500 });
  }

  const normalizedAdminEmail = adminEmail.trim().toLowerCase();
  const profileMatch = (payoutProfiles || []).find(
    (profile) => (profile.email || "").trim().toLowerCase() === normalizedAdminEmail
  );

  // Backward-compatible fallback while transitioning off env-configured platform account.
  const legacyFallbackAccount = process.env.CROWDROAST_STRIPE_CONNECT_ACCOUNT_ID || null;
  const crowdroastDestinationAccount =
    profileMatch?.stripe_connect_account_id || legacyFallbackAccount;

  if (!crowdroastDestinationAccount) {
    return NextResponse.json(
      {
        error:
          "Admin Stripe Connect account is not connected for platform payouts (and no legacy fallback account is configured).",
      },
      { status: 500 }
    );
  }

  const nowIso = new Date().toISOString();

  const { data: dueLots, error: dueLotsError } = await admin
    .from("lots")
    .select(
      "id, seller_id, status, currency, price_per_kg, committed_quantity_kg, min_commitment_kg, commitment_deadline, settlement_status"
    )
    .lte("commitment_deadline", nowIso)
    .in("settlement_status", ["pending", "failed"])
    .in("status", ["active", "fully_committed", "closed"]);

  if (dueLotsError) {
    return NextResponse.json({ error: dueLotsError.message }, { status: 500 });
  }

  const results: Array<Record<string, unknown>> = [];

  for (const lot of dueLots || []) {
    const minimumMet = Number(lot.committed_quantity_kg) >= Number(lot.min_commitment_kg);

    if (!minimumMet) {
      const { data: lotCommitments, error: lotCommitmentsError } = await admin
        .from("commitments")
        .select("id, payment_status, stripe_payment_intent_id")
        .eq("lot_id", lot.id);

      if (lotCommitmentsError) {
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
          error: lotCommitmentsError.message,
        });
        continue;
      }

      let refundedCount = 0;
      let refundFailedCount = 0;

      for (const commitment of lotCommitments || []) {
        if (
          commitment.payment_status === "charge_succeeded" &&
          commitment.stripe_payment_intent_id
        ) {
          try {
            await createRefund({
              paymentIntentId: commitment.stripe_payment_intent_id,
              commitmentId: commitment.id,
              idempotencySuffix: "minimum-not-met",
            });

            await admin
              .from("commitments")
              .update({
                status: "cancelled",
                payment_status: "cancelled",
                payment_error: "Refunded: lot minimum not met by deadline",
              })
              .eq("id", commitment.id);

            refundedCount += 1;
          } catch (refundError) {
            refundFailedCount += 1;
            await admin
              .from("commitments")
              .update({
                payment_error:
                  refundError instanceof Error ? refundError.message : "Refund failed",
              })
              .eq("id", commitment.id);
          }
        } else {
          await admin
            .from("commitments")
            .update({
              status: "cancelled",
              payment_status: "cancelled",
              payment_error: "Cancelled: lot minimum not met by deadline",
            })
            .eq("id", commitment.id);
        }
      }

      await admin
        .from("lots")
        .update({
          status: "closed",
          settlement_status: refundFailedCount > 0 ? "failed" : "minimum_not_met",
          settlement_processed_at: nowIso,
        })
        .eq("id", lot.id);

      results.push({
        lot_id: lot.id,
        outcome: refundFailedCount > 0 ? "failed" : "minimum_not_met",
        commitments_refunded: refundedCount,
        refunds_failed: refundFailedCount,
      });
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

    const { data: unpaidCommitments } = await admin
      .from("commitments")
      .select("id")
      .eq("lot_id", lot.id)
      .neq("payment_status", "charge_succeeded")
      .neq("status", "cancelled");

    const { data: tiers } = await admin
      .from("pricing_tiers")
      .select("min_quantity_kg, price_per_kg")
      .eq("lot_id", lot.id)
      .order("min_quantity_kg", { ascending: false });

    const finalPricePerKg = getFinalPricePerKg(
      lot.price_per_kg,
      lot.committed_quantity_kg,
      tiers || []
    );

    const { data: commitments, error: commitmentsError } = await admin
      .from("commitments")
      .select(
        "id, status, payment_status, hub_id, quantity_kg, total_price, charge_amount_cents, charge_currency, stripe_charge_id, stripe_payment_intent_id"
      )
      .eq("lot_id", lot.id)
      .eq("payment_status", "charge_succeeded")
      .neq("status", "confirmed");

    if (commitmentsError) {
      results.push({ lot_id: lot.id, outcome: "failed", error: commitmentsError.message });
      continue;
    }

    let failedCount = unpaidCommitments?.length || 0;
    let succeededCount = 0;
    const hubConnectAccountByHubId = new Map<string, string | null>();

    for (const commitment of commitments || []) {
      const commitmentHubId = commitment.hub_id;
      if (!commitmentHubId) {
        failedCount += 1;
        await admin
          .from("commitments")
          .update({
            payment_error: "Missing hub_id on commitment",
          })
          .eq("id", commitment.id);
        continue;
      }

      let hubDestinationAccount = hubConnectAccountByHubId.get(commitmentHubId) || null;
      if (!hubConnectAccountByHubId.has(commitmentHubId)) {
        const { data: hub } = await admin
          .from("hubs")
          .select("owner_id")
          .eq("id", commitmentHubId)
          .single();

        const { data: hubOwnerProfile } = hub?.owner_id
          ? await admin
              .from("profiles")
              .select("stripe_connect_account_id")
              .eq("id", hub.owner_id)
              .single()
          : { data: null };

        hubDestinationAccount = hubOwnerProfile?.stripe_connect_account_id || null;
        hubConnectAccountByHubId.set(commitmentHubId, hubDestinationAccount);
      }

      if (!hubDestinationAccount) {
        failedCount += 1;
        await admin
          .from("commitments")
          .update({
            payment_error: "Hub owner is missing stripe_connect_account_id",
          })
          .eq("id", commitment.id);
        continue;
      }

      const amountCents = Number(commitment.charge_amount_cents || 0);
      const currency = (commitment.charge_currency || lot.currency || "usd").toLowerCase();

      if (!commitment.stripe_charge_id || amountCents <= 0) {
        failedCount += 1;
        await admin
          .from("commitments")
          .update({
            payment_error: "Missing successful charge data for settlement transfer",
          })
          .eq("id", commitment.id);
        continue;
      }

      try {
        const { finalAmountCents, refundAmountCents } = computeChargeAdjustment({
          quantityKg: commitment.quantity_kg,
          committedTotalPrice: commitment.total_price,
          finalPricePerKg,
        });

        if (refundAmountCents > 0) {
          if (!commitment.stripe_payment_intent_id) {
            throw new Error("Missing payment intent for price-adjustment refund");
          }

          await createRefund({
            paymentIntentId: commitment.stripe_payment_intent_id,
            amountCents: refundAmountCents,
            commitmentId: commitment.id,
            idempotencySuffix: "price-adjustment",
          });
        }

        const split = computeSplit(finalAmountCents);

        if (split.sellerAmount > 0) {
          await createTransfer({
            amountCents: split.sellerAmount,
            currency,
            destinationAccountId: sellerProfile.stripe_connect_account_id,
            sourceChargeId: commitment.stripe_charge_id,
            commitmentId: commitment.id,
            role: "seller",
          });
        }

        if (split.hubAmount > 0) {
          await createTransfer({
            amountCents: split.hubAmount,
            currency,
            destinationAccountId: hubDestinationAccount,
            sourceChargeId: commitment.stripe_charge_id,
            commitmentId: commitment.id,
            role: "hub",
          });
        }

        if (split.platformAmount > 0) {
          await createTransfer({
            amountCents: split.platformAmount,
            currency,
            destinationAccountId: crowdroastDestinationAccount,
            sourceChargeId: commitment.stripe_charge_id,
            commitmentId: commitment.id,
            role: "crowdroast",
          });
        }

        await admin
          .from("commitments")
          .update({
            status: "confirmed",
            charge_amount_cents: finalAmountCents,
            charge_currency: currency,
            payment_error: null,
          })
          .eq("id", commitment.id);

        succeededCount += 1;
      } catch (transferError) {
        failedCount += 1;
        await admin
          .from("commitments")
          .update({
            payment_error:
              transferError instanceof Error ? transferError.message : "Transfer failed",
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

export async function POST(request: Request) {
  return settleDeadlines(request);
}

export async function GET(request: Request) {
  return settleDeadlines(request);
}

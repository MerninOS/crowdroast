import { createAdminClient } from "@/lib/supabase/admin";
import { getConfiguredAdminEmail } from "@/lib/auth/admin";
import {
  createRefund,
  createTransfer,
  getConnectedAccount,
  getPaymentIntent,
  listRefundsForPaymentIntent,
  listTransfersForSourceCharge,
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

function isMissingPlatformSettingsTable(error: { message?: string } | null) {
  if (!error?.message) return false;
  return error.message.includes("platform_settings");
}

function hasTransferCapability(account: {
  capabilities?: {
    transfers?: string;
    crypto_transfers?: string;
    legacy_payments?: string;
  };
}) {
  return (
    account.capabilities?.transfers === "active" ||
    account.capabilities?.crypto_transfers === "active" ||
    account.capabilities?.legacy_payments === "active"
  );
}

function getExistingTransferAmountForRole(
  transfers: Array<{
    amount?: number;
    destination?: string | null;
    metadata?: { commitment_id?: string; recipient_role?: string };
  }>,
  commitmentId: string,
  role: "seller" | "hub" | "crowdroast",
  destinationAccountId: string
) {
  return transfers
    .filter(
      (transfer) =>
        (transfer.metadata?.commitment_id === commitmentId &&
          transfer.metadata?.recipient_role === role) ||
        transfer.destination === destinationAccountId
    )
    .reduce((sum, transfer) => sum + Number(transfer.amount || 0), 0);
}

async function settleDeadlines(request: Request) {
  const { searchParams } = new URL(request.url);
  const debug = searchParams.get("debug") === "1";

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
  const { data: platformSettings, error: platformSettingsError } = await admin
    .from("platform_settings")
    .select("platform_connect_account_id")
    .eq("id", 1)
    .maybeSingle();

  if (platformSettingsError && !isMissingPlatformSettingsTable(platformSettingsError)) {
    return NextResponse.json({ error: platformSettingsError.message }, { status: 500 });
  }

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
    platformSettings?.platform_connect_account_id ||
    profileMatch?.stripe_connect_account_id ||
    legacyFallbackAccount;

  if (!crowdroastDestinationAccount) {
    return NextResponse.json(
      {
        error:
          "Platform payout account is not configured in platform_settings, admin profile, or legacy env fallback.",
      },
      { status: 500 }
    );
  }

  try {
    const platformAccount = await getConnectedAccount(crowdroastDestinationAccount);
    if (!hasTransferCapability(platformAccount)) {
      return NextResponse.json(
        {
          error:
            "Platform connected account does not have transfers capability enabled. Complete onboarding from /dashboard/admin/payouts.",
        },
        { status: 500 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to validate platform account capabilities" },
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
    .in("settlement_status", ["pending", "failed"]);

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
        if (!debug) {
          await admin
            .from("lots")
            .update({
              settlement_status: "failed",
              settlement_processed_at: nowIso,
            })
            .eq("id", lot.id);
        }

        results.push({
          lot_id: lot.id,
          outcome: "failed",
          error: lotCommitmentsError.message,
        });
        continue;
      }

      let refundedCount = 0;
      let refundFailedCount = 0;
      const debugCommitments: Array<Record<string, unknown>> = [];

      for (const commitment of lotCommitments || []) {
        if (debug) {
          debugCommitments.push({
            commitment_id: commitment.id,
            mode: "minimum_not_met",
            payment_status: commitment.payment_status,
            stripe_payment_intent_id: commitment.stripe_payment_intent_id,
            would_refund:
              commitment.payment_status === "charge_succeeded" &&
              Boolean(commitment.stripe_payment_intent_id),
          });
          continue;
        }

        if (
          commitment.payment_status === "charge_succeeded" &&
          commitment.stripe_payment_intent_id
        ) {
          try {
            if (debug) {
              refundedCount += 1;
              continue;
            }

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
          if (!debug) {
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
      }

      if (!debug) {
        await admin
          .from("lots")
          .update({
            status: "closed",
            settlement_status: refundFailedCount > 0 ? "failed" : "minimum_not_met",
            settlement_processed_at: nowIso,
          })
          .eq("id", lot.id);
      }

      results.push({
        lot_id: lot.id,
        outcome: refundFailedCount > 0 ? "failed" : "minimum_not_met",
        commitments_refunded: refundedCount,
        refunds_failed: refundFailedCount,
        ...(debug ? { debug_commitments: debugCommitments } : {}),
      });
      continue;
    }

    const { data: sellerProfile } = await admin
      .from("profiles")
      .select("stripe_connect_account_id")
      .eq("id", lot.seller_id)
      .single();

    if (!sellerProfile?.stripe_connect_account_id) {
      if (!debug) {
        await admin
          .from("lots")
          .update({
            settlement_status: "failed",
            settlement_processed_at: nowIso,
          })
          .eq("id", lot.id);
      }

      results.push({
        lot_id: lot.id,
        outcome: "failed",
        error: "Seller is missing stripe_connect_account_id",
        ...(debug ? { debug_lot: { seller_id: lot.seller_id } } : {}),
      });
      continue;
    }

    let sellerTransfersEnabled = false;
    try {
      const sellerAccount = await getConnectedAccount(sellerProfile.stripe_connect_account_id);
      sellerTransfersEnabled = hasTransferCapability(sellerAccount);
    } catch {
      sellerTransfersEnabled = false;
    }

    if (!sellerTransfersEnabled) {
      if (!debug) {
        await admin
          .from("lots")
          .update({
            settlement_status: "failed",
            settlement_processed_at: nowIso,
          })
          .eq("id", lot.id);
      }

      results.push({
        lot_id: lot.id,
        outcome: "failed",
        error: "Seller connected account lacks transfers capability",
        ...(debug
          ? {
              debug_lot: {
                seller_destination_account: sellerProfile.stripe_connect_account_id,
              },
            }
          : {}),
      });
      continue;
    }

    const { data: unpaidCommitments } = await admin
      .from("commitments")
      .select("id")
      .eq("lot_id", lot.id)
      .is("stripe_payment_intent_id", null)
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
      .not("stripe_payment_intent_id", "is", null)
      .neq("status", "confirmed")
      .neq("status", "cancelled");

    if (commitmentsError) {
      results.push({ lot_id: lot.id, outcome: "failed", error: commitmentsError.message });
      continue;
    }

    let failedCount = unpaidCommitments?.length || 0;
    let succeededCount = 0;
    const debugCommitments: Array<Record<string, unknown>> = [];
    const hubConnectAccountByHubId = new Map<string, string | null>();
    const transferCapabilityByAccount = new Map<string, boolean>();

    for (const commitment of commitments || []) {
      const commitmentHubId = commitment.hub_id;
      if (!commitmentHubId) {
        failedCount += 1;
        if (debug) {
          debugCommitments.push({
            commitment_id: commitment.id,
            error: "Missing hub_id on commitment",
          });
        } else {
          await admin
            .from("commitments")
            .update({
              payment_error: "Missing hub_id on commitment",
            })
            .eq("id", commitment.id);
        }
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
        if (debug) {
          debugCommitments.push({
            commitment_id: commitment.id,
            hub_id: commitmentHubId,
            error: "Hub owner is missing stripe_connect_account_id",
          });
        } else {
          await admin
            .from("commitments")
            .update({
              payment_error: "Hub owner is missing stripe_connect_account_id",
            })
            .eq("id", commitment.id);
        }
        continue;
      }

      let hubTransfersEnabled = transferCapabilityByAccount.get(hubDestinationAccount);
      if (hubTransfersEnabled === undefined) {
        try {
          const hubAccount = await getConnectedAccount(hubDestinationAccount);
          hubTransfersEnabled = hasTransferCapability(hubAccount);
        } catch {
          hubTransfersEnabled = false;
        }
        transferCapabilityByAccount.set(hubDestinationAccount, hubTransfersEnabled);
      }

      if (!hubTransfersEnabled) {
        failedCount += 1;
        if (debug) {
          debugCommitments.push({
            commitment_id: commitment.id,
            hub_id: commitmentHubId,
            hub_destination_account: hubDestinationAccount,
            error: "Hub owner connected account lacks transfers capability",
          });
        } else {
          await admin
            .from("commitments")
            .update({
              payment_error: "Hub owner connected account lacks transfers capability",
            })
            .eq("id", commitment.id);
        }
        continue;
      }

      const amountCents = Number(commitment.charge_amount_cents || 0);
      const currency = (commitment.charge_currency || lot.currency || "usd").toLowerCase();

      let stripeChargeId = commitment.stripe_charge_id;
      let paymentIntentStatus: string | null = null;
      if (!stripeChargeId && commitment.stripe_payment_intent_id) {
        try {
          const paymentIntent = await getPaymentIntent(commitment.stripe_payment_intent_id);
          stripeChargeId = paymentIntent.latest_charge || null;
          paymentIntentStatus = paymentIntent.status || null;
          if (stripeChargeId && !debug) {
            await admin
              .from("commitments")
              .update({
                stripe_charge_id: stripeChargeId,
                payment_status: "charge_succeeded",
              })
              .eq("id", commitment.id);
          }
        } catch {
          // Keep original flow below; commitment will be marked failed with details.
        }
      }

      if (!stripeChargeId || amountCents <= 0) {
        failedCount += 1;
        if (debug) {
          debugCommitments.push({
            commitment_id: commitment.id,
            stripe_payment_intent_id: commitment.stripe_payment_intent_id,
            stripe_charge_id: stripeChargeId,
            charged_amount_cents: amountCents,
            payment_intent_status: paymentIntentStatus,
            error: "Missing successful charge data for settlement transfer",
          });
        } else {
          await admin
            .from("commitments")
            .update({
              payment_error: "Missing successful charge data for settlement transfer",
            })
            .eq("id", commitment.id);
        }
        continue;
      }

      try {
        const { finalAmountCents, refundAmountCents } = computeChargeAdjustment({
          quantityKg: commitment.quantity_kg,
          committedTotalPrice: commitment.total_price,
          finalPricePerKg,
        });

        let existingRefunds: Array<{
          id?: string;
          amount?: number;
          payment_intent?: string | null;
          metadata?: { commitment_id?: string };
        }> = [];
        if (commitment.stripe_payment_intent_id) {
          try {
            const refunds = await listRefundsForPaymentIntent(commitment.stripe_payment_intent_id);
            existingRefunds = refunds.data || [];
          } catch {
            existingRefunds = [];
          }
        }
        const existingRefundAmount = existingRefunds.reduce(
          (sum, refund) => sum + Number(refund.amount || 0),
          0
        );

        if (!debug && refundAmountCents > 0) {
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
        let existingTransfers: Array<{
          amount?: number;
          destination?: string | null;
          metadata?: { commitment_id?: string; recipient_role?: string };
        }> = [];

        try {
          const transfers = await listTransfersForSourceCharge(stripeChargeId);
          existingTransfers = transfers.data || [];
        } catch {
          existingTransfers = [];
        }

        const existingSellerAmount = getExistingTransferAmountForRole(
          existingTransfers,
          commitment.id,
          "seller",
          sellerProfile.stripe_connect_account_id
        );
        const missingSellerAmount = Math.max(0, split.sellerAmount - existingSellerAmount);
        if (!debug && missingSellerAmount > 0) {
          await createTransfer({
            amountCents: missingSellerAmount,
            currency,
            destinationAccountId: sellerProfile.stripe_connect_account_id,
            sourceChargeId: stripeChargeId,
            commitmentId: commitment.id,
            role: "seller",
          });
        }

        const existingHubAmount = getExistingTransferAmountForRole(
          existingTransfers,
          commitment.id,
          "hub",
          hubDestinationAccount
        );
        const missingHubAmount = Math.max(0, split.hubAmount - existingHubAmount);
        if (!debug && missingHubAmount > 0) {
          await createTransfer({
            amountCents: missingHubAmount,
            currency,
            destinationAccountId: hubDestinationAccount,
            sourceChargeId: stripeChargeId,
            commitmentId: commitment.id,
            role: "hub",
          });
        }

        const existingPlatformAmount = getExistingTransferAmountForRole(
          existingTransfers,
          commitment.id,
          "crowdroast",
          crowdroastDestinationAccount
        );
        const missingPlatformAmount = Math.max(0, split.platformAmount - existingPlatformAmount);
        if (debug) {
          debugCommitments.push({
            commitment_id: commitment.id,
            payment_status: commitment.payment_status,
            payment_intent_status: paymentIntentStatus,
            stripe_payment_intent_id: commitment.stripe_payment_intent_id,
            stripe_charge_id: stripeChargeId,
            charged_amount_cents: amountCents,
            final_amount_cents: finalAmountCents,
            refund_amount_cents: refundAmountCents,
            existing_refund_amount_cents: existingRefundAmount,
            available_to_transfer_cents: Math.max(
              0,
              amountCents - existingRefundAmount
            ),
            split,
            existing_transfer_amounts: {
              seller: existingSellerAmount,
              hub: existingHubAmount,
              crowdroast: existingPlatformAmount,
              total: existingTransfers.reduce(
                (sum, transfer) => sum + Number(transfer.amount || 0),
                0
              ),
            },
            transfer_headroom_cents:
              amountCents -
              existingTransfers.reduce(
                (sum, transfer) => sum + Number(transfer.amount || 0),
                0
              ),
            missing_transfer_amounts: {
              seller: missingSellerAmount,
              hub: missingHubAmount,
              crowdroast: missingPlatformAmount,
              total:
                missingSellerAmount + missingHubAmount + missingPlatformAmount,
            },
            existing_transfers: existingTransfers,
            existing_refunds: existingRefunds,
            destination_accounts: {
              seller: sellerProfile.stripe_connect_account_id,
              hub: hubDestinationAccount,
              crowdroast: crowdroastDestinationAccount,
            },
          });
          succeededCount += 1;
          continue;
        }

        if (missingPlatformAmount > 0) {
          await createTransfer({
            amountCents: missingPlatformAmount,
            currency,
            destinationAccountId: crowdroastDestinationAccount,
            sourceChargeId: stripeChargeId,
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
        if (debug) {
          debugCommitments.push({
            commitment_id: commitment.id,
            error:
              transferError instanceof Error ? transferError.message : "Transfer failed",
          });
        } else {
          await admin
            .from("commitments")
            .update({
              payment_error:
                transferError instanceof Error ? transferError.message : "Transfer failed",
            })
            .eq("id", commitment.id);
        }
      }
    }

    if (!debug) {
      await admin
        .from("lots")
        .update({
          status: "closed",
          settlement_status: failedCount > 0 ? "failed" : "settled",
          settlement_processed_at: nowIso,
        })
        .eq("id", lot.id);
    }

    results.push({
      lot_id: lot.id,
      outcome: failedCount > 0 ? "failed" : "settled",
      commitments_succeeded: succeededCount,
      commitments_failed: failedCount,
      ...(debug ? { debug_commitments: debugCommitments } : {}),
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

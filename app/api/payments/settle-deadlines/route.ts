import { createAdminClient } from "@/lib/supabase/admin";
import { getConfiguredAdminEmails } from "@/lib/auth/admin";
import { authorizeCronRequest } from "@/lib/auth/cron-route";
import {
  sendLotClosedEmailsBatch,
  sendLotFailedEmail,
  sendReferralCreditEarnedEmail,
} from "@/lib/email";
import { finalizeCampaign } from "@/lib/lots/finalize-campaign";
import { createShipmentForLot } from "@/lib/shipments";
import {
  createRefund,
  createTransfer,
  getChargeFeeCents,
  getConnectedAccount,
  getPaymentIntent,
  listRefundsForPaymentIntent,
  listTransfersForSourceCharge,
} from "@/lib/stripe";
import {
  applyStripeFeeToPlatformShare,
  computeChargeAdjustment,
  computeSellerNetAmountCents,
  computeSplit,
  getFinalPricePerKg,
} from "@/lib/payments/settlement-logic";
import { insertReferralAttributionIfEligible } from "@/lib/referrals/insert-attribution";
import { settleAttributionIfPending } from "@/lib/referrals/settle-attribution";
import { voidAttributionsForCampaign } from "@/lib/referrals/void-attribution";
import { applyInviterCreditOnSettle } from "@/lib/referrals/apply-credit";
import { NextResponse } from "next/server";

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

type AdminClient = ReturnType<typeof createAdminClient>;

// AC-6: Send success emails when a lot settles — fire-and-forget, never throws
async function sendLotSuccessNotifications(admin: AdminClient, lotId: string, hubId: string): Promise<void> {
  console.log("[sendLotSuccessNotifications] starting for lot", lotId, "hub", hubId);
  try {
    const { data: lot, error: lotError } = await admin
      .from("lots")
      .select("id, title, seller_id, committed_quantity_kg")
      .eq("id", lotId)
      .single();
    console.log("[sendLotSuccessNotifications] lot fetch:", { lot, lotError });
    if (!lot) return;

    const { data: seller, error: sellerError } = await admin
      .from("profiles")
      .select("email, contact_name")
      .eq("id", lot.seller_id)
      .single();
    console.log("[sendLotSuccessNotifications] seller fetch:", { seller: seller?.email, sellerError });

    const { data: commitments, error: commitmentsError } = await admin
      .from("commitments")
      .select("id, buyer_id, quantity_kg, total_price")
      .eq("lot_id", lotId)
      .eq("status", "confirmed");
    console.log("[sendLotSuccessNotifications] confirmed commitments:", { count: commitments?.length, commitmentsError });

    const buyerIds = [...new Set((commitments || []).map((c) => c.buyer_id).filter(Boolean))];
    const { data: buyers } =
      buyerIds.length > 0
        ? await admin.from("profiles").select("id, email, contact_name").in("id", buyerIds)
        : { data: [] };
    const buyerMap = new Map((buyers || []).map((b) => [b.id, b]));
    console.log("[sendLotSuccessNotifications] buyer profiles fetched:", buyerIds.length);

    let hub: { id: string; name: string; address: string | null; city: string | null; state: string | null; country: string | null; owner_id: string } | null = null;
    let hubOwner: { email: string | null; contact_name: string | null } | null = null;

    if (hubId) {
      const { data: hubData, error: hubError } = await admin
        .from("hubs")
        .select("id, name, address, city, state, country, owner_id")
        .eq("id", hubId)
        .single();
      console.log("[sendLotSuccessNotifications] hub fetch:", { hub: hubData?.id, hubError });
      hub = hubData;
      if (hub?.owner_id) {
        const { data: ownerProfile, error: ownerError } = await admin
          .from("profiles")
          .select("email, contact_name")
          .eq("id", hub.owner_id)
          .single();
        console.log("[sendLotSuccessNotifications] hub owner fetch:", { email: ownerProfile?.email, ownerError });
        hubOwner = ownerProfile;
      }
    } else {
      console.log("[sendLotSuccessNotifications] no hubId provided — skipping seller and hub owner emails");
    }

    const buyerPayloads = (commitments || [])
      .map((commitment) => {
        const buyer = buyerMap.get(commitment.buyer_id);
        if (!buyer?.email) {
          console.log("[sendLotSuccessNotifications] skipping buyer — no email for buyer_id", commitment.buyer_id);
          return null;
        }
        return { buyer: { email: buyer.email, contact_name: buyer.contact_name }, commitment };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    console.log("[sendLotSuccessNotifications] sending batch:", {
      buyers: buyerPayloads.length,
      seller: seller?.email ?? "none",
      hubOwner: hubOwner?.email ?? "none",
      hub: hub?.id ?? "none",
    });

    // Sum confirmed commitments rather than reading lot.committed_quantity_kg
    // — by the time this runs, finalize_campaign has already reset the lot
    // row to committed_quantity_kg=0 as part of the recycle.
    const totalQuantityKg = (commitments || []).reduce(
      (sum, c) => sum + Number(c.quantity_kg || 0),
      0
    );

    const result = await sendLotClosedEmailsBatch({
      lot: { id: lot.id, title: lot.title, total_quantity_kg: totalQuantityKg },
      buyers: buyerPayloads,
      seller,
      hub,
      hubOwner,
    });

    console.log("[sendLotSuccessNotifications] batch result:", result);
    console.log("[sendLotSuccessNotifications] done for lot", lotId);
  } catch (err) {
    console.error("[sendLotSuccessNotifications] unexpected error:", err);
  }
}

// AC-7: Send failure emails when a lot does not meet minimum — fire-and-forget, never throws
async function sendLotFailedNotifications(admin: AdminClient, lotId: string, hubId: string): Promise<void> {
  try {
    const { data: lot } = await admin
      .from("lots")
      .select("id, title, seller_id")
      .eq("id", lotId)
      .single();
    if (!lot) return;

    const { data: seller } = await admin
      .from("profiles")
      .select("email, contact_name")
      .eq("id", lot.seller_id)
      .single();

    const { data: commitments } = await admin
      .from("commitments")
      .select("buyer_id")
      .eq("lot_id", lotId);

    const buyerIds = [...new Set((commitments || []).map((c) => c.buyer_id).filter(Boolean))];
    const { data: buyers } =
      buyerIds.length > 0
        ? await admin.from("profiles").select("id, email, contact_name").in("id", buyerIds)
        : { data: [] };

    let hubOwners: Array<{ id: string; email: string | null; contact_name: string | null }> = [];
    if (hubId) {
      const { data: hub } = await admin.from("hubs").select("owner_id").eq("id", hubId).single();
      if (hub?.owner_id) {
        const { data: owner } = await admin
          .from("profiles")
          .select("id, email, contact_name")
          .eq("id", hub.owner_id)
          .single();
        if (owner) hubOwners = [owner];
      }
    }

    const emailPromises: Promise<unknown>[] = [];
    // Dedupe by lower-cased email so a seller who is also a hub member or
    // a buyer (admin testing accounts, shared inboxes) doesn't get the
    // failure email twice. Seller send wins because it carries the
    // awaiting_relist CTA the seller actually needs.
    const sentTo = new Set<string>();

    if (seller?.email) {
      sentTo.add(seller.email.toLowerCase());
      emailPromises.push(
        sendLotFailedEmail({
          recipient: { email: seller.email, contact_name: seller.contact_name },
          lot: { id: lot.id, title: lot.title },
          isSeller: true,
        }).catch(console.error)
      );
    }

    for (const buyer of buyers || []) {
      if (!buyer.email) continue;
      const key = buyer.email.toLowerCase();
      if (sentTo.has(key)) continue;
      sentTo.add(key);
      emailPromises.push(
        sendLotFailedEmail({
          recipient: { email: buyer.email, contact_name: buyer.contact_name },
          lot: { id: lot.id, title: lot.title },
        }).catch(console.error)
      );
    }

    for (const owner of hubOwners) {
      if (!owner.email) continue;
      const key = owner.email.toLowerCase();
      if (sentTo.has(key)) continue;
      sentTo.add(key);
      emailPromises.push(
        sendLotFailedEmail({
          recipient: { email: owner.email, contact_name: owner.contact_name },
          lot: { id: lot.id, title: lot.title },
        }).catch(console.error)
      );
    }

    await Promise.allSettled(emailPromises);
  } catch (err) {
    console.error("sendLotFailedNotifications error:", err);
  }
}

async function settleDeadlines(request: Request) {
  const { searchParams } = new URL(request.url);
  const debug = searchParams.get("debug") === "1";

  const unauthorized = authorizeCronRequest(request);
  if (unauthorized) return unauthorized;

  const adminEmails = getConfiguredAdminEmails();
  if (adminEmails.length === 0) {
    return NextResponse.json(
      { error: "Missing ADMIN_EMAIL or ADMIN_EMAILS for platform payout destination" },
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

  const profileMatch = (payoutProfiles || []).find(
    (profile) => adminEmails.includes((profile.email || "").trim().toLowerCase())
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

  const { data: dueCampaigns, error: dueCampaignsError } = await admin
    .from("campaigns")
    .select("id, lot_id, hub_id, deadline, status")
    .lte("deadline", nowIso)
    .eq("status", "active");

  if (dueCampaignsError) {
    return NextResponse.json({ error: dueCampaignsError.message }, { status: 500 });
  }

  const results: Array<Record<string, unknown>> = [];
  const finalizeFailures: Array<{ campaign_id: string; outcome: string; error: string }> = [];
  const backgroundTasks: Promise<unknown>[] = [];

  for (const campaign of dueCampaigns || []) {
    // Cancel orphans first — commitments where the buyer started checkout but never
    // got `stripe_payment_intent_id` stamped. Webhooks should already have done this
    // on `checkout.session.expired`/`payment_intent.payment_failed`; this is the
    // safety net for races (last-minute commits, missed webhooks). Cancelling fires
    // the lot trigger so committed_quantity_kg drops to truth before we read it.
    let orphansCancelled = 0;
    if (!debug) {
      const { data: orphans } = await admin
        .from("commitments")
        .select("id")
        .eq("campaign_id", campaign.id)
        .is("stripe_payment_intent_id", null)
        .neq("status", "cancelled")
        .neq("status", "confirmed");

      for (const orphan of orphans || []) {
        await admin
          .from("commitments")
          .update({
            status: "cancelled",
            payment_status: "cancelled",
            payment_error: "Cancelled at deadline: payment never completed",
          })
          .eq("id", orphan.id);
        orphansCancelled += 1;
      }
    }

    const { data: lot, error: lotFetchError } = await admin
      .from("lots")
      .select(
        "id, title, seller_id, status, currency, price_per_kg, committed_quantity_kg, min_commitment_kg, commitment_deadline"
      )
      .eq("id", campaign.lot_id)
      .single();

    if (lotFetchError || !lot) {
      results.push({
        campaign_id: campaign.id,
        lot_id: campaign.lot_id,
        outcome: "failed",
        error: lotFetchError?.message || "Lot not found",
      });
      continue;
    }

    const minimumMet = Number(lot.committed_quantity_kg) >= Number(lot.min_commitment_kg);

    if (!minimumMet) {
      const { data: lotCommitments, error: lotCommitmentsError } = await admin
        .from("commitments")
        .select("id, payment_status, stripe_payment_intent_id, stripe_charge_id")
        .eq("campaign_id", campaign.id);

      if (lotCommitmentsError) {
        if (!debug) {
          await admin
            .from("campaigns")
            .update({ status: "failed" })
            .eq("id", campaign.id);

          await admin
            .from("lots")
            .update({
              settlement_status: "failed",
              settlement_processed_at: nowIso,
            })
            .eq("id", lot.id);
        }

        results.push({
          campaign_id: campaign.id,
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

            // Stripe doesn't refund the processing fee on a refund — it stays
            // a real cost to the platform balance. Stamp the fee on the
            // commitment for accounting visibility (best-effort; never block
            // the cancel update on this).
            let failedStripeFeeCents: number | null = null;
            if (commitment.stripe_charge_id) {
              try {
                const fee = await getChargeFeeCents(commitment.stripe_charge_id);
                if (fee !== null) failedStripeFeeCents = fee;
              } catch {
                failedStripeFeeCents = null;
              }
            }

            await admin
              .from("commitments")
              .update({
                status: "cancelled",
                payment_status: "cancelled",
                stripe_fee_cents: failedStripeFeeCents,
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
        // Atomically mark the campaign failed AND recycle the lot. The
        // per-commitment refund/cancel work above already ran; if finalize
        // fails the campaign stays 'active' and the next cron tick retries
        // (refunds and commitment cancels are both idempotent).
        const finalizeResult = await finalizeCampaign(admin, campaign.id, "failed");
        if (!finalizeResult.ok) {
          console.error(
            `settle-deadlines: finalize_campaign failed for failed campaign ${campaign.id}`,
            finalizeResult.error
          );
          finalizeFailures.push({
            campaign_id: campaign.id,
            outcome: "failed",
            error: finalizeResult.error,
          });
        }
      }

      results.push({
        campaign_id: campaign.id,
        lot_id: lot.id,
        outcome: refundFailedCount > 0 ? "failed" : "minimum_not_met",
        commitments_refunded: refundedCount,
        refunds_failed: refundFailedCount,
        ...(debug ? { debug_commitments: debugCommitments } : {}),
      });

      // AC-7: notify all parties that the campaign failed
      if (!debug) backgroundTasks.push(sendLotFailedNotifications(admin, lot.id, campaign.hub_id));

      // Buyer-referral: lot failed → void any pending attributions tied to
      // this campaign. Earned attributions are untouched (criterion 8).
      // No credit_ledger writes — voiding never moves money.
      if (!debug) await voidAttributionsForCampaign(admin, campaign.id);

      continue;
    }

    const { data: sellerProfile } = await admin
      .from("profiles")
      .select("stripe_connect_account_id")
      .eq("id", lot.seller_id)
      .single();

    if (!sellerProfile?.stripe_connect_account_id) {
      // Seller never finished Stripe Connect onboarding — we can't transfer
      // funds. Deliberately do NOT recycle here: the lot is in a stuck state
      // that needs operator + seller intervention before any retry. Mark the
      // campaign failed and tag the lot with settlement_status='failed' so
      // the admin payouts dashboard can surface it.
      if (!debug) {
        await admin
          .from("campaigns")
          .update({ status: "failed" })
          .eq("id", campaign.id)
          .eq("status", "active");

        await admin
          .from("lots")
          .update({
            settlement_status: "failed",
            settlement_processed_at: nowIso,
          })
          .eq("id", lot.id);
      }

      results.push({
        campaign_id: campaign.id,
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
      // Same as the missing-account branch above: don't recycle a lot whose
      // settlement is structurally blocked by the seller's Stripe Connect
      // state. The lot stays 'closed' with settlement_status='failed' for
      // operator triage; no retry will succeed until onboarding is fixed.
      if (!debug) {
        await admin
          .from("campaigns")
          .update({ status: "failed" })
          .eq("id", campaign.id)
          .eq("status", "active");

        await admin
          .from("lots")
          .update({
            settlement_status: "failed",
            settlement_processed_at: nowIso,
          })
          .eq("id", lot.id);
      }

      results.push({
        campaign_id: campaign.id,
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

    const { data: tiers } = await admin
      .from("pricing_tiers")
      .select("min_quantity_kg, price_per_kg")
      .eq("lot_id", lot.id)
      .order("min_quantity_kg", { ascending: false });

    const finalSellerPricePerKg = getFinalPricePerKg(
      lot.price_per_kg,
      lot.committed_quantity_kg,
      tiers || []
    );

    const { data: commitments, error: commitmentsError } = await admin
      .from("commitments")
      .select(
        "id, buyer_id, status, payment_status, hub_id, quantity_kg, total_price, charge_amount_cents, charge_currency, stripe_charge_id, stripe_payment_intent_id"
      )
      .eq("campaign_id", campaign.id)
      .not("stripe_payment_intent_id", "is", null)
      .neq("status", "confirmed")
      .neq("status", "cancelled");

    if (commitmentsError) {
      results.push({ campaign_id: campaign.id, lot_id: lot.id, outcome: "failed", error: commitmentsError.message });
      continue;
    }

    let transferFailedCount = 0;
    let failedCount = 0;
    let succeededCount = 0;
    const debugCommitments: Array<Record<string, unknown>> = [];
    const hubConnectAccountByHubId = new Map<string, string | null>();
    const transferCapabilityByAccount = new Map<string, boolean>();

    for (const commitment of commitments || []) {
      const commitmentHubId = campaign.hub_id;

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
        transferFailedCount += 1;
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
        transferFailedCount += 1;
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

            // Buyer-referral: settlement just self-corrected this commitment
            // to charge_succeeded after a missed webhook. Helper is
            // idempotent so calling it here is safe even if the webhook
            // ever lands later.
            await insertReferralAttributionIfEligible(admin, commitment.id);
          }
        } catch {
          // Keep original flow below; commitment will be marked failed with details.
        }
      }

      if (!stripeChargeId || amountCents <= 0) {
        failedCount += 1;
        transferFailedCount += 1;
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
          finalSellerPricePerKg,
        });

        const sellerNetAmountCents = computeSellerNetAmountCents(
          commitment.quantity_kg,
          finalSellerPricePerKg
        );

        let existingRefunds: Array<{
          id?: string;
          amount?: number;
          payment_intent?: string | null;
          metadata?: {
            commitment_id?: string;
            kind?: "price_adjustment" | "inviter_credit";
          };
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
            kind: "price_adjustment",
          });
        }

        const split = computeSplit({
          grossAmountCents: finalAmountCents,
          sellerNetAmountCents,
        });

        // Stripe debits its processing fee from the platform's main balance
        // when the charge clears — not from source_transaction-tied transfers.
        // To stop the platform balance from running short by ~3% per commit,
        // pull the actual fee from BalanceTransaction and absorb it out of
        // CrowdRoast's platform share. Seller and hub shares stay whole.
        let stripeFeeCents = 0;
        try {
          const fee = await getChargeFeeCents(stripeChargeId);
          if (fee !== null) stripeFeeCents = fee;
        } catch {
          // BalanceTransaction may not be ready yet (rare for cards); leave
          // fee at 0 for this run. The next cron pass will retry — transfers
          // are idempotent via existing-amount diffing below, so a later run
          // that learns the real fee will still book it correctly because
          // we re-derive missingPlatformAmount each run.
          stripeFeeCents = 0;
        }
        const platformFeeApplication = applyStripeFeeToPlatformShare(
          split.platformAmount,
          stripeFeeCents
        );

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

        // Buyer-referral: apply the buyer's credit balance against Mernin's
        // share on this commit (criteria 9, 10). Inserts a single negative
        // credit_ledger row and reduces Mernin's effective platform target
        // by that amount. Idempotent across cron retries via the partial
        // unique index on (source_commitment_id) WHERE reason='commit_applied'.
        //
        // Note: platformAmountAfterFee already has the Stripe processing fee
        // deducted, so inviter credits stack on top of fee absorption — both
        // costs land on CrowdRoast.
        const platformAmountAfterFee = platformFeeApplication.adjustedPlatformAmountCents;
        const creditApplication = debug
          ? { applied: 0, adjustedPlatformAmountCents: platformAmountAfterFee, ledgerRowInserted: false }
          : await applyInviterCreditOnSettle(admin, {
              commitmentId: commitment.id,
              buyerId: commitment.buyer_id,
              platformAmountCents: platformAmountAfterFee,
            });

        const adjustedPlatformAmount = creditApplication.adjustedPlatformAmountCents;
        const missingPlatformAmount = Math.max(0, adjustedPlatformAmount - existingPlatformAmount);
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
            stripe_fee_cents: stripeFeeCents,
            platform_fee_application: platformFeeApplication,
            platform_amount_after_fee: platformAmountAfterFee,
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

        // Buyer-referral: refund the applied credit amount back to the buyer's
        // original payment method. The platform transfer above is already net
        // of `applied`, so CrowdRoast's operating account receives less by
        // exactly that much; refunding the same amount to the buyer leaves
        // seller and hub whole, gives the buyer the dollar value of the
        // credit they earned, and books the cost cleanly to the platform.
        //
        // Idempotency: filter existingRefunds by metadata.kind === 'inviter_credit'
        // so cron retries past Stripe's ~24h idempotency window don't double-
        // refund. Only issue what's still missing relative to the applied
        // total. Subtle: existingRefunds was loaded before this commitment's
        // price-adjustment refund (if any), but that refund is tagged
        // 'price_adjustment' so the kind filter excludes it correctly.
        if (creditApplication.applied > 0 && commitment.stripe_payment_intent_id) {
          const existingInviterCreditRefundAmount = existingRefunds
            .filter((r) => r.metadata?.kind === "inviter_credit")
            .reduce((sum, r) => sum + Number(r.amount || 0), 0);
          const missingInviterCreditRefund = Math.max(
            0,
            creditApplication.applied - existingInviterCreditRefundAmount
          );
          if (missingInviterCreditRefund > 0) {
            await createRefund({
              paymentIntentId: commitment.stripe_payment_intent_id,
              amountCents: missingInviterCreditRefund,
              commitmentId: commitment.id,
              idempotencySuffix: "inviter-credit",
              kind: "inviter_credit",
            });
          }
        }

        await admin
          .from("commitments")
          .update({
            status: "confirmed",
            charge_amount_cents: finalAmountCents,
            charge_currency: currency,
            stripe_fee_cents: stripeFeeCents || null,
            payment_error: null,
          })
          .eq("id", commitment.id);

        // Buyer-referral: lot settled successfully for this commit. If the
        // invitee's first-charged commitment was this one, flip the pending
        // attribution to earned and emit the +$10 credit_ledger row for the
        // inviter. Idempotent — partial unique index handles cron retries.
        // When the helper signals a fresh ledger insert (earned=true), fire
        // ReferralCreditEarned to the inviter as a background task so a
        // delivery hiccup never fails the cron loop.
        //
        // Safety net: also try to insert the attribution row here. The
        // webhook is the primary creator (at first charge_succeeded), but a
        // missed/delayed/failed webhook would leave the invitee permanently
        // un-attributed and the inviter would never earn the credit. Calling
        // the helper here is idempotent — no-op when an attribution already
        // exists — and guarantees that any commitment reaching settlement in
        // charge_succeeded with profiles.invited_by_user_id set gets a row
        // before settleAttributionIfPending runs.
        if (!debug) {
          await insertReferralAttributionIfEligible(admin, commitment.id);
          const settleResult = await settleAttributionIfPending(admin, commitment.id);
          if (settleResult.earned && settleResult.inviterUserId) {
            const inviterUserId = settleResult.inviterUserId;
            backgroundTasks.push(
              (async () => {
                const { data: inviterProfile } = await admin
                  .from("profiles")
                  .select("email, contact_name")
                  .eq("id", inviterUserId)
                  .maybeSingle();
                const { data: inviteeProfile } = await admin
                  .from("profiles")
                  .select("contact_name")
                  .eq("id", commitment.buyer_id)
                  .maybeSingle();
                if (!inviterProfile?.email) return;
                await sendReferralCreditEarnedEmail({
                  inviter: {
                    email: inviterProfile.email,
                    contact_name: inviterProfile.contact_name,
                  },
                  inviteeName: inviteeProfile?.contact_name || "A new roaster",
                  lotTitle: lot?.title ?? null,
                });
              })().catch(() => undefined)
            );
          }
        }

        succeededCount += 1;
      } catch (transferError) {
        failedCount += 1;
        transferFailedCount += 1;
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
      if (failedCount > 0) {
        // Transfer failures leave the lot in a stuck-closed state for manual
        // investigation. We do NOT call finalize_campaign here — recycling
        // mid-Stripe-flow would clear hub_lots while transfers are still
        // incomplete. Mark the campaign failed inline (no retry hazard since
        // there's nothing left to recycle) and leave the lot 'closed' for
        // operator triage.
        await admin
          .from("campaigns")
          .update({ status: "failed" })
          .eq("id", campaign.id)
          .eq("status", "active");

        await admin
          .from("lots")
          .update({
            status: "closed",
            settlement_status: "failed",
            settlement_processed_at: nowIso,
          })
          .eq("id", lot.id);
      } else {
        // Clean settle: atomically mark the campaign settled AND recycle
        // the lot. If finalize fails, the campaign stays 'active' and the
        // next cron tick re-attempts (the per-commitment confirmed updates
        // above are idempotent).
        const finalizeResult = await finalizeCampaign(admin, campaign.id, "settled");
        if (!finalizeResult.ok) {
          console.error(
            `settle-deadlines: finalize_campaign failed for settled campaign ${campaign.id}`,
            finalizeResult.error
          );
          finalizeFailures.push({
            campaign_id: campaign.id,
            outcome: "settled",
            error: finalizeResult.error,
          });
        }
      }
    }

    results.push({
      campaign_id: campaign.id,
      lot_id: lot.id,
      outcome: failedCount > 0 ? "failed" : "settled",
      commitments_succeeded: succeededCount,
      commitments_failed: failedCount,
      orphans_cancelled: orphansCancelled,
      ...(debug ? { debug_commitments: debugCommitments } : {}),
    });

    // AC-6: notify all parties on successful settlement
    console.log("[settle-deadlines] campaign", campaign.id, "lot", lot.id, "— debug:", debug, "transferFailedCount:", transferFailedCount, "failedCount:", failedCount, "succeededCount:", succeededCount, "orphansCancelled:", orphansCancelled);
    if (!debug && transferFailedCount === 0) {
      backgroundTasks.push(sendLotSuccessNotifications(admin, lot.id, campaign.hub_id));
      backgroundTasks.push(createShipmentForLot(lot.id, campaign.hub_id, campaign.id));
    } else {
      console.log("[settle-deadlines] skipping success emails and shipment creation — condition not met");
    }
  }

  // Await all notification/shipment tasks so they complete before the
  // serverless function exits. Previously these were fire-and-forget (`void`)
  // and could be silently dropped when the function returned.
  await Promise.allSettled(backgroundTasks);

  return NextResponse.json(
    {
      processed_campaigns: results.length,
      results,
      finalize_failures: finalizeFailures,
    },
    // 207 (Multi-Status) when any finalize_campaign call failed; the cron
    // runner can use the non-2xx status to surface partial failure while
    // the body still reports per-campaign progress.
    { status: finalizeFailures.length > 0 ? 207 : 200 }
  );
}

export async function POST(request: Request) {
  return settleDeadlines(request);
}

export async function GET(request: Request) {
  return settleDeadlines(request);
}

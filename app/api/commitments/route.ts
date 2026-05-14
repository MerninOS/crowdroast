import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createPaymentCheckoutSession,
  createSetupCheckoutSession,
  createStripeCustomer,
} from "@/lib/stripe";
import { addPlatformFee } from "@/lib/pricing";
import { assignKgToBags } from "@/lib/bag-assignment";
import { computeCompletedBagsAndPrice } from "@/lib/settle-bag-pricing";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { lot_id, quantity_kg, notes, hub_id } = body;

  if (!lot_id || !quantity_kg || quantity_kg <= 0) {
    return NextResponse.json(
      { error: "lot_id and a positive quantity_kg are required" },
      { status: 400 }
    );
  }

  // Fetch lot
  const { data: lot, error: lotError } = await supabase
    .from("lots")
    .select("*")
    .eq("id", lot_id)
    .single();

  if (lotError || !lot) {
    return NextResponse.json({ error: "Lot not found" }, { status: 404 });
  }

  if (lot.status !== "active") {
    return NextResponse.json(
      { error: "Lot is not accepting commitments" },
      { status: 400 }
    );
  }

  // Bag-size backfill gate: legacy lots created before bag-aware close have
  // bag_size_kg = NULL until the seller backfills via the seller dashboard.
  // Block commits hard at the route boundary — must run before any Stripe
  // call or commitment insert so we don't create orphaned setup intents.
  if (lot.bag_size_kg === null || lot.bag_size_kg === undefined) {
    return NextResponse.json(
      {
        error:
          "This lot is still being set up. The seller needs to confirm the bag size before commits can be placed.",
      },
      { status: 400 }
    );
  }

  // Look up active campaign for this lot + hub
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, deadline, status")
    .eq("lot_id", lot_id)
    .eq("hub_id", hub_id)
    .eq("status", "active")
    .maybeSingle();

  if (campaignError) {
    return NextResponse.json(
      { error: `Campaign lookup failed: ${campaignError.message}` },
      { status: 500 }
    );
  }

  if (!campaign) {
    return NextResponse.json(
      { error: "No active campaign for this lot in your hub" },
      { status: 400 }
    );
  }

  // Check campaign deadline
  if (campaign.deadline && new Date(campaign.deadline) < new Date()) {
    return NextResponse.json(
      { error: "Campaign deadline has passed" },
      { status: 400 }
    );
  }

  if (lot.seller_id === user.id) {
    return NextResponse.json(
      { error: "Cannot commit to your own lot" },
      { status: 400 }
    );
  }

  // Find the buyer's existing commit on this campaign, if any. One-row-per-
  // buyer-per-campaign: a second commit *adds* to the prior quantity rather
  // than creating a new row. Cancelled rows don't block — the buyer can
  // recommit after a self-cancel.
  const { data: existingCommit } = await supabase
    .from("commitments")
    .select(
      "id, quantity_kg, payment_status, stripe_customer_id, stripe_payment_method_id, stripe_checkout_session_id"
    )
    .eq("campaign_id", campaign.id)
    .eq("buyer_id", user.id)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // The new TOTAL quantity (existing + this request).
  const existingQty = existingCommit?.quantity_kg ?? 0;
  const newTotalQuantityKg = existingQty + quantity_kg;

  // Remaining-kg gate. After the trigger fix, `lot.committed_quantity_kg`
  // only counts commits with `payment_status IN ('setup_complete',
  // 'charge_succeeded')`. So the buyer's existing kg is only in that
  // aggregate if their card is already saved; otherwise it's "free pool"
  // until they finish Stripe.
  const priorCountedQty =
    existingCommit && existingCommit.payment_status === "setup_complete"
      ? existingQty
      : 0;
  const othersCommittedKg = lot.committed_quantity_kg - priorCountedQty;
  const buyerCeiling = lot.total_quantity_kg - othersCommittedKg;
  if (newTotalQuantityKg > buyerCeiling) {
    const addable = Math.max(0, buyerCeiling - existingQty);
    return NextResponse.json(
      { error: `Only ${addable} kg remaining on this lot` },
      { status: 400 }
    );
  }

  // Fetch pricing tiers — bag-aware tiers carry `min_bags`, legacy tiers
  // carry `min_quantity_kg`. The bag-aware path uses computeCompletedBagsAndPrice
  // (the same algorithm settlement uses) directly off the bag-shaped rows.
  const { data: tiers } = await supabase
    .from("pricing_tiers")
    .select("min_bags, min_quantity_kg, price_per_kg")
    .eq("lot_id", lot_id)
    .order("min_quantity_kg", { ascending: false });

  // The lot-wide total that WOULD result if the buyer finishes setup.
  // Independent of where their prior kg currently sits (counted or not in
  // lot.committed_quantity_kg under the new trigger) — we always project
  // others + buyer's new total.
  const lotTotalAfter = othersCommittedKg + newTotalQuantityKg;

  // Resolve the active seller price per kg. For bag-aware lots (the live
  // path now), keep the commit-time tier in sync with settlement by
  // routing through computeCompletedBagsAndPrice — same algorithm that
  // lib/settle-bag-pricing.ts uses at deadline. Without this, a buyer can
  // be quoted one price (kg-tier) and charged another (bag-tier) at
  // settlement when min_quantity_kg doesn't land on a bag boundary.
  let activeSellerPricePerKg = lot.price_per_kg;
  if (lot.bag_size_kg !== null && lot.bag_size_kg > 0) {
    const { price_per_kg } = computeCompletedBagsAndPrice({
      total_committed_kg: lotTotalAfter,
      bag_size_kg: Number(lot.bag_size_kg),
      base_price_per_kg: lot.price_per_kg,
      tiers: (tiers ?? []).map((t) => ({
        min_bags:
          t.min_bags === null || t.min_bags === undefined
            ? null
            : Number(t.min_bags),
        price_per_kg: t.price_per_kg,
      })),
    });
    activeSellerPricePerKg = price_per_kg;
  } else if (tiers && tiers.length > 0) {
    // Legacy kg-tier resolution preserved for unconverted lots.
    for (const tier of tiers) {
      if (
        typeof tier.min_quantity_kg === "number" &&
        lotTotalAfter >= tier.min_quantity_kg
      ) {
        activeSellerPricePerKg = tier.price_per_kg;
        break; // tiers are sorted desc, so first match is the highest applicable
      }
    }
  }

  const activeBuyerPricePerKg = addPlatformFee(activeSellerPricePerKg);
  const total_price = newTotalQuantityKg * activeBuyerPricePerKg;
  const chargeAmountCents = Math.round(total_price * 100);

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, stripe_customer_id")
    .eq("id", user.id)
    .single();

  let stripeCustomerId: string | null =
    existingCommit?.stripe_customer_id ||
    profile?.stripe_customer_id ||
    null;
  if (!stripeCustomerId) {
    const customer = await createStripeCustomer(profile?.email || user.email || null);
    stripeCustomerId = customer.id;

    await supabase
      .from("profiles")
      .update({ stripe_customer_id: stripeCustomerId })
      .eq("id", user.id);
  }

  // Three persistence shapes:
  //   A. Card already saved on existing row (payment_status='setup_complete'):
  //      just bump quantity + price. No Stripe round-trip. Trigger updates
  //      lot.committed_quantity_kg.
  //   B. Existing row still pending (no card yet): bump quantity, reset
  //      Stripe-session columns, and we'll send the buyer back to Stripe to
  //      finish the setup. The row stays one-per-buyer.
  //   C. No existing row: insert fresh and send to Stripe.
  const isAdditiveWithSavedCard =
    !!existingCommit &&
    existingCommit.payment_status === "setup_complete" &&
    !!existingCommit.stripe_payment_method_id;

  const basePayload = {
    lot_id,
    buyer_id: user.id,
    hub_id: hub_id || null,
    campaign_id: campaign.id,
    quantity_kg: newTotalQuantityKg,
    price_per_kg: activeSellerPricePerKg,
    total_price,
    notes: notes || null,
    charge_amount_cents: chargeAmountCents,
    charge_currency: (lot.currency || "USD").toLowerCase(),
    stripe_customer_id: stripeCustomerId,
  };

  let data: { id: string } & Record<string, unknown>;

  if (isAdditiveWithSavedCard && existingCommit) {
    // Path A — additive, card already saved. Keep payment_status=setup_complete.
    const { data: updated, error } = await supabase
      .from("commitments")
      .update({
        ...basePayload,
        // Don't reset stripe_* fields — the saved card stays put.
      })
      .eq("id", existingCommit.id)
      .select()
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    data = updated;
  } else if (existingCommit) {
    // Path B — additive, but card setup never completed. Bump quantity and
    // reset the Stripe-session columns so a fresh setup session can be
    // generated below.
    const { data: updated, error } = await supabase
      .from("commitments")
      .update({
        ...basePayload,
        status: "pending",
        payment_status: "pending_setup",
        stripe_checkout_session_id: null,
        stripe_setup_intent_id: null,
        stripe_payment_method_id: null,
        stripe_payment_intent_id: null,
        stripe_charge_id: null,
        payment_error: null,
        charged_at: null,
      })
      .eq("id", existingCommit.id)
      .select()
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    data = updated;
  } else {
    // Path C — first commit on this campaign for this buyer.
    const { data: inserted, error } = await supabase
      .from("commitments")
      .insert({
        ...basePayload,
        status: "pending",
        payment_status: "pending_setup",
        stripe_checkout_session_id: null,
        stripe_setup_intent_id: null,
        stripe_payment_method_id: null,
        stripe_payment_intent_id: null,
        stripe_charge_id: null,
        payment_error: null,
        charged_at: null,
      })
      .select()
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    data = inserted;
  }

  // Short-circuit Path A: the row is set; settlement will charge the saved
  // card per bag at close. No Stripe redirect needed; the form will refresh
  // and show the new total.
  if (isAdditiveWithSavedCard) {
    return NextResponse.json(
      { commitment: data, updated_quantity_kg: newTotalQuantityKg },
      { status: 200 }
    );
  }

  // Compute the bag-aware Locked/Filling split for the buyer's new commit.
  // The 1.9 gate guarantees lot.bag_size_kg is a positive integer at this point.
  // This runs before Stripe so a Stripe failure path doesn't lose the split work
  // (and so a successful response includes the split alongside the checkout URL).
  let split: { locked_kg: number; filling_kg: number } | null = null;
  const { data: campaignCommits, error: campaignCommitsError } = await supabase
    .from("commitments")
    .select("id, quantity_kg, created_at")
    .eq("campaign_id", campaign.id)
    .neq("status", "cancelled");

  if (campaignCommitsError || !campaignCommits) {
    console.warn(
      `[commitments] failed to load campaign commits for split (campaign_id=${campaign.id}): ${
        campaignCommitsError?.message ?? "no data"
      }`
    );
  } else {
    try {
      const assignments = assignKgToBags({
        commitments: campaignCommits as Array<{
          id: string;
          quantity_kg: number;
          created_at: string;
        }>,
        bag_size_kg: lot.bag_size_kg,
      });
      const own = assignments.find((row) => row.commitment_id === data.id);
      if (own) {
        split = { locked_kg: own.locked_kg, filling_kg: own.filling_kg };
      } else {
        console.warn(
          `[commitments] assignKgToBags did not return a row for new commitment ${data.id} (campaign_id=${campaign.id})`
        );
      }
    } catch (assignError) {
      console.warn(
        `[commitments] assignKgToBags threw for campaign_id=${campaign.id}: ${
          assignError instanceof Error ? assignError.message : "unknown error"
        }`
      );
    }
  }

  const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL;
  if (!origin) {
    return NextResponse.json(
      { error: "Missing request origin and NEXT_PUBLIC_APP_URL" },
      { status: 500 }
    );
  }

  try {
    const successUrl = `${origin}/dashboard/buyer/commitments?payment=success`;
    const cancelUrl = `${origin}/dashboard/buyer/lot/${lot_id}?payment=cancelled`;

    // Bag-aware path: lots with a configured bag_size_kg do not charge at
    // commit time (AC5). We save the card via a setup-mode Checkout Session
    // and let settlement issue per-bag charges later. The 1.9 gate above
    // already rejects null bag_size_kg, so this branch is the live path for
    // every current commit; the legacy mode-payment branch below is kept
    // byte-for-byte for any lots that bypass the gate. Auth-probe wiring
    // (AC12) lands in 4.3b — this task only saves the card.
    if (lot.bag_size_kg !== null && lot.bag_size_kg !== undefined) {
      const setupSession = await createSetupCheckoutSession({
        customerId: stripeCustomerId!,
        successUrl,
        cancelUrl,
        commitmentId: data.id,
        lotId: lot_id,
        currency: lot.currency || "USD",
      });

      // The hosted Checkout Session in mode: setup returns a `url` for the
      // buyer-facing redirect. Surface it as `setup_client_secret` per the
      // 4.3 contract — the frontend swap (mode: payment → mode: setup) keys
      // off this field name to distinguish bag-aware responses from legacy.
      if (!setupSession.url) {
        throw new Error("Stripe setup checkout session returned no URL");
      }

      await supabase
        .from("commitments")
        .update({ stripe_checkout_session_id: setupSession.id })
        .eq("id", data.id);

      return NextResponse.json(
        {
          commitment: data,
          setup_client_secret: setupSession.url,
          ...(split ? { split } : {}),
        },
        { status: 201 }
      );
    }

    const session = await createPaymentCheckoutSession({
      customerId: stripeCustomerId!,
      successUrl,
      cancelUrl,
      commitmentId: data.id,
      lotId: lot_id,
      currency: lot.currency || "USD",
      amountCents: chargeAmountCents,
      lineItemName: `${lot.title} commitment`,
    });

    await supabase
      .from("commitments")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", data.id);

    return NextResponse.json(
      {
        commitment: data,
        checkout_url: session.url,
        ...(split ? { split } : {}),
      },
      { status: 201 }
    );
  } catch (checkoutError) {
    // Use admin client here: migration #44's trigger blocks
    // authenticated-role UPDATEs that set payment_error to a non-null
    // value (B1 mitigation). This is a legitimate server-side error
    // recording, so service-role is the right context. The .eq("id",
    // data.id) keeps the scope tight to the row we just inserted.
    const adminClient = createAdminClient();
    await adminClient
      .from("commitments")
      .update({
        payment_status: "charge_failed",
        payment_error:
          checkoutError instanceof Error
            ? checkoutError.message
            : "Failed to create checkout session",
      })
      .eq("id", data.id);

    return NextResponse.json(
      {
        error:
          checkoutError instanceof Error
            ? checkoutError.message
            : "Failed to initialize payment checkout",
      },
      { status: 500 }
    );
  }
}

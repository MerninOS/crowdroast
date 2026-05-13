import { createClient } from "@/lib/supabase/server";
import {
  createPaymentCheckoutSession,
  createStripeCustomer,
} from "@/lib/stripe";
import { addPlatformFee } from "@/lib/pricing";
import { assignKgToBags } from "@/lib/bag-assignment";
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

  const remaining = lot.total_quantity_kg - lot.committed_quantity_kg;
  if (quantity_kg > remaining) {
    return NextResponse.json(
      { error: `Only ${remaining} kg remaining` },
      { status: 400 }
    );
  }

  // Fetch pricing tiers to determine the active price
  const { data: tiers } = await supabase
    .from("pricing_tiers")
    .select("*")
    .eq("lot_id", lot_id)
    .order("min_quantity_kg", { ascending: false });

  // After this commitment, the new total committed quantity
  const newTotal = lot.committed_quantity_kg + quantity_kg;

  // Find the highest tier that the new total reaches
  let activeSellerPricePerKg = lot.price_per_kg;
  if (tiers && tiers.length > 0) {
    for (const tier of tiers) {
      if (newTotal >= tier.min_quantity_kg) {
        activeSellerPricePerKg = tier.price_per_kg;
        break; // tiers are sorted desc, so first match is the highest applicable
      }
    }
  }

  const activeBuyerPricePerKg = addPlatformFee(activeSellerPricePerKg);
  const total_price = quantity_kg * activeBuyerPricePerKg;
  const chargeAmountCents = Math.round(total_price * 100);

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, stripe_customer_id")
    .eq("id", user.id)
    .single();

  let stripeCustomerId: string | null = profile?.stripe_customer_id || null;
  if (!stripeCustomerId) {
    const customer = await createStripeCustomer(profile?.email || user.email || null);
    stripeCustomerId = customer.id;

    await supabase
      .from("profiles")
      .update({ stripe_customer_id: stripeCustomerId })
      .eq("id", user.id);
  }

  const { data: existingUnpaidCommitment } = await supabase
    .from("commitments")
    .select("id")
    .eq("lot_id", lot_id)
    .eq("buyer_id", user.id)
    .is("stripe_payment_intent_id", null)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const commitmentPayload = {
    lot_id,
    buyer_id: user.id,
    hub_id: hub_id || null,
    campaign_id: campaign.id,
    quantity_kg,
    price_per_kg: activeSellerPricePerKg,
    total_price,
    notes: notes || null,
    status: "pending",
    payment_status: "pending_setup",
    charge_amount_cents: chargeAmountCents,
    charge_currency: (lot.currency || "USD").toLowerCase(),
    stripe_customer_id: stripeCustomerId,
    stripe_checkout_session_id: null,
    stripe_setup_intent_id: null,
    stripe_payment_method_id: null,
    stripe_payment_intent_id: null,
    stripe_charge_id: null,
    payment_error: null,
    charged_at: null,
  };

  const commitmentQuery = existingUnpaidCommitment
    ? supabase
        .from("commitments")
        .update(commitmentPayload)
        .eq("id", existingUnpaidCommitment.id)
    : supabase.from("commitments").insert(commitmentPayload);

  const { data, error } = await commitmentQuery.select().single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
    await supabase
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

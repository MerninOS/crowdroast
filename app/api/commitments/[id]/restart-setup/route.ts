/**
 * Buyer-initiated card-update flow for the bag-aware lifecycle.
 *
 * Wired to the "Update payment" button on `NeedsAttentionCard` and to the
 * `manageUrl` baked into the AC13 "Your card declined" email
 * (lib/charge-worker.ts → sendPaymentUpdateRequiredEmail). The buyer hits
 * this endpoint, we mint a fresh Stripe Checkout setup session attached
 * to the existing commitment, and return the redirect URL. The buyer's
 * subsequent webhook completion (a) writes the new PM onto the commit
 * and (b) re-arms any terminal `payment_failed` bag charges via
 * `lib/bag-charge-rearm.ts` so the charge worker retries them with the
 * new card on the next cron tick.
 *
 * Auth model:
 *   - Buyer must be authenticated (Supabase session) and OWN this commit.
 *   - Commit must have at least one `payment_failed` bag row OR be in
 *     legacy `charge_failed` state. The 400 on "nothing to retry" stops
 *     the endpoint from rotating sessions on a healthy in-flight commit.
 *   - Commit must have a `stripe_customer_id` already on file — re-using
 *     it preserves the buyer's saved methods + history. A null customer
 *     id means the commit never finished initial setup and the buyer
 *     should re-run the commit flow from scratch, not this restart path.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSetupCheckoutSession } from "@/lib/stripe";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://crowdroast.com";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: commitmentId } = await context.params;
  if (!commitmentId) {
    return NextResponse.json(
      { error: "Missing commitment id" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // RLS-bound read scopes to the buyer's own rows. We additionally check
  // buyer_id below as belt-and-suspenders so an RLS misconfiguration can't
  // silently grant access.
  const { data: commitment, error: readError } = await supabase
    .from("commitments")
    .select(
      "id, buyer_id, lot_id, status, payment_status, stripe_customer_id, lot:lots(id, currency)"
    )
    .eq("id", commitmentId)
    .maybeSingle();
  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 500 });
  }
  if (!commitment) {
    return NextResponse.json({ error: "Commitment not found" }, { status: 404 });
  }
  if (commitment.buyer_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (commitment.status === "cancelled") {
    return NextResponse.json(
      { error: "Cannot restart a cancelled commitment" },
      { status: 400 }
    );
  }
  if (!commitment.stripe_customer_id) {
    // Means the commit never completed initial setup. Restart-setup
    // re-attaches a PM to the EXISTING customer; without one we'd have to
    // create a fresh customer and the buyer's saved methods elsewhere
    // would be split. Send them back to the lot to re-commit cleanly.
    return NextResponse.json(
      {
        error:
          "This commitment has no payment customer on file yet. Re-commit from the lot page to set one up.",
      },
      { status: 400 }
    );
  }

  // Guard: only restart when there's actually something to fix. Without
  // this check the endpoint would rotate the buyer's session id on every
  // call and orphan in-flight Stripe sessions.
  const admin = createAdminClient();
  const { data: failedBags, error: failedReadError } = await admin
    .from("commitment_bag_charges")
    .select("id")
    .eq("commitment_id", commitmentId)
    .eq("payment_status", "payment_failed")
    .limit(1);
  if (failedReadError) {
    return NextResponse.json(
      { error: failedReadError.message },
      { status: 500 }
    );
  }
  const hasFailedBags = !!(failedBags && failedBags.length > 0);
  const legacyFailed = commitment.payment_status === "charge_failed";
  if (!hasFailedBags && !legacyFailed) {
    return NextResponse.json(
      { error: "No failed charges to retry on this commitment" },
      { status: 400 }
    );
  }

  // PostgREST returns embeds as single objects or arrays depending on
  // cardinality inference. The lots foreign key is one-to-one so we
  // expect a single object — coerce defensively.
  const lot = Array.isArray(commitment.lot)
    ? (commitment.lot[0] as { id: string; currency: string | null } | undefined)
    : (commitment.lot as { id: string; currency: string | null } | null);
  if (!lot?.id) {
    return NextResponse.json(
      { error: "Commitment is missing its lot reference" },
      { status: 500 }
    );
  }

  // Mint the fresh setup session. The success/cancel URLs land back on
  // the commitments dashboard with a banner key so the page can show a
  // brief confirmation. The webhook's bag-charge re-arm will already have
  // fired by the time the buyer lands here (Stripe fires both
  // checkout.session.completed and setup_intent.succeeded synchronously
  // with the redirect), so the page just needs to confirm "thanks, we
  // queued the retry".
  const session = await createSetupCheckoutSession({
    customerId: commitment.stripe_customer_id,
    successUrl: `${APP_URL}/dashboard/buyer/commitments?restart=success`,
    cancelUrl: `${APP_URL}/dashboard/buyer/commitments?restart=cancelled`,
    commitmentId: commitment.id,
    lotId: lot.id,
    currency: lot.currency || "USD",
  });
  if (!session.url) {
    return NextResponse.json(
      { error: "Stripe setup session returned no redirect URL" },
      { status: 502 }
    );
  }

  // Update the commit to point at the new session. We deliberately do
  // NOT clear stripe_payment_method_id here — if the buyer abandons the
  // restart flow, their old PM is still on file and the worker can keep
  // retrying with it (per the retry ladder). The webhook will overwrite
  // PM cleanly on completion.
  await admin
    .from("commitments")
    .update({
      payment_status: "pending_setup",
      stripe_checkout_session_id: session.id,
      stripe_setup_intent_id: null,
      payment_error: null,
      card_auth_failed_email_sent_at: null,
    })
    .eq("id", commitmentId);

  return NextResponse.json({ url: session.url }, { status: 200 });
}

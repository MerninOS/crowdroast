import { createAdminClient } from "@/lib/supabase/admin";
import {
  getPaymentIntent,
  getSetupIntent,
  probeCardAuth,
  verifyStripeWebhookSignature,
} from "@/lib/stripe";
import { insertReferralAttributionIfEligible } from "@/lib/referrals/insert-attribution";
import { sendCardAuthFailedEmail } from "@/lib/email";
import { NextResponse } from "next/server";

interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const payload = await request.text();
  const isValid = verifyStripeWebhookSignature(payload, signature);
  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(payload) as StripeEvent;

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as {
        id: string;
        mode?: string;
        setup_intent?: string | null;
        payment_intent?: string | null;
        payment_status?: string | null;
        customer?: string | null;
        payment_method?: string | null;
      };

      if (session.mode === "payment") {
        const admin = createAdminClient();

        let latestCharge: string | null = null;
        if (session.payment_intent) {
          try {
            const paymentIntent = await getPaymentIntent(session.payment_intent);
            latestCharge = paymentIntent.latest_charge || null;
          } catch {
            latestCharge = null;
          }
        }

        const updatePayload: Record<string, unknown> = {
          stripe_customer_id: session.customer || null,
          stripe_payment_intent_id: session.payment_intent || null,
          stripe_charge_id: latestCharge,
        };

        if (session.payment_status === "paid") {
          updatePayload.payment_status = "charge_succeeded";
          updatePayload.charged_at = new Date().toISOString();
          updatePayload.payment_error = null;
        } else {
          // Cancel the commitment so the lot quantity trigger drops it.
          // Without `status: 'cancelled'` the row keeps inflating committed_quantity_kg.
          updatePayload.status = "cancelled";
          updatePayload.payment_status = "charge_failed";
          updatePayload.payment_error = "Checkout completed without paid status";
        }

        await admin
          .from("commitments")
          .update(updatePayload)
          .eq("stripe_checkout_session_id", session.id);

        // Buyer-referral: when this update flipped payment_status to
        // charge_succeeded, attempt to create the (pending) attribution row.
        // Helper is idempotent — safe to call alongside the payment_intent
        // .succeeded handler below which may also fire for the same commit.
        if (updatePayload.payment_status === "charge_succeeded") {
          const { data: commitmentRow } = await admin
            .from("commitments")
            .select("id")
            .eq("stripe_checkout_session_id", session.id)
            .maybeSingle();
          if (commitmentRow?.id) {
            await insertReferralAttributionIfEligible(admin, commitmentRow.id);
          }
        }
      } else if (session.mode === "setup") {
        const admin = createAdminClient();

        // Stripe sets `session.payment_method` to null on hosted-redirect
        // setup sessions; the actual PM lives on the resulting setup_intent.
        // Resolve it now so we can both persist it and probe it (AC12).
        let paymentMethodId: string | null = session.payment_method || null;
        if (!paymentMethodId && session.setup_intent) {
          try {
            const setupIntent = await getSetupIntent(session.setup_intent);
            paymentMethodId = setupIntent.payment_method || null;
          } catch {
            paymentMethodId = null;
          }
        }

        const updatePayload: Record<string, unknown> = {
          payment_status: "setup_complete",
          stripe_setup_intent_id: session.setup_intent || null,
          stripe_customer_id: session.customer || null,
        };
        if (paymentMethodId) {
          updatePayload.stripe_payment_method_id = paymentMethodId;
        }

        await admin
          .from("commitments")
          .update(updatePayload)
          .eq("stripe_checkout_session_id", session.id);

        // AC12: now that the buyer has finished Stripe-hosted setup, verify
        // the saved card will actually clear at settlement by running a
        // tiny auth-and-void via probeCardAuth. The probe is idempotent
        // (deterministic key per PM), so Stripe webhook retries are safe.
        //
        // Settlement-gate convention: the charge worker reads
        // `payment_error IS NULL` as the "card cleared the probe" signal.
        // We therefore leave `payment_status` at 'setup_complete' on both
        // outcomes and use `payment_error` as the auth-OK / auth-failed
        // discriminator. No new CHECK-constraint enum value required.
        const customerId = session.customer || null;
        if (paymentMethodId && customerId) {
          // Look up the commitment with the lot + buyer it belongs to so
          // we can (a) write `payment_error` to the right row on failure
          // and (b) compose the buyer email with the lot title + manage
          // URL on the failure branch.
          const { data: commitmentRow } = await admin
            .from("commitments")
            .select(
              "id, lot:lots!commitments_lot_id_fkey(id, title, currency), buyer:profiles!commitments_buyer_id_fkey(email, contact_name)"
            )
            .eq("stripe_checkout_session_id", session.id)
            .maybeSingle();

          const lot = (commitmentRow?.lot ?? null) as
            | { id: string; title: string; currency: string | null }
            | null;
          const buyer = (commitmentRow?.buyer ?? null) as
            | { email: string | null; contact_name: string | null }
            | null;
          const currency = lot?.currency || "USD";

          const probe = await probeCardAuth({
            paymentMethodId,
            customerId,
            currency,
          });

          if (!probe.ok) {
            await admin
              .from("commitments")
              .update({
                payment_error: `Auth probe failed: ${probe.reason}`,
              })
              .eq("stripe_checkout_session_id", session.id);

            // Best-effort buyer notification. Failure to send the email
            // must not 500 the webhook (Stripe would retry and re-probe).
            if (commitmentRow?.id && lot && buyer?.email) {
              try {
                await sendCardAuthFailedEmail({
                  buyer: {
                    email: buyer.email,
                    contact_name: buyer.contact_name,
                  },
                  lot: { id: lot.id, title: lot.title },
                  commitmentId: commitmentRow.id,
                  failureReason: probe.reason,
                });
              } catch (emailErr) {
                console.warn(
                  "[webhook checkout.session.completed mode=setup] failed to send card-auth-failed email",
                  emailErr instanceof Error ? emailErr.message : emailErr
                );
              }
            }
          }
          // On probe.ok === true we leave `payment_error` NULL — the row's
          // existing state IS the auth-OK signal (per the IS NULL gate
          // convention above). No extra column or timestamp needed.
        } else if (!paymentMethodId) {
          // Defensive: a successful setup session should always yield a PM.
          // If we somehow didn't get one, surface it via payment_error so
          // the settlement worker treats this row as not-ready-to-charge
          // and buyer-facing tooling can prompt for a new card.
          await admin
            .from("commitments")
            .update({
              payment_error: "Couldn't retrieve payment method after setup",
            })
            .eq("stripe_checkout_session_id", session.id);
        }
      }
    }

    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object as {
        id: string;
        latest_charge?: string | null;
        metadata?: { commitment_id?: string };
      };

      if (paymentIntent.metadata?.commitment_id) {
        const admin = createAdminClient();

        await admin
          .from("commitments")
          .update({
            payment_status: "charge_succeeded",
            stripe_payment_intent_id: paymentIntent.id,
            stripe_charge_id: paymentIntent.latest_charge || null,
            charged_at: new Date().toISOString(),
            payment_error: null,
          })
          .eq("id", paymentIntent.metadata.commitment_id);

        // Buyer-referral: first charge_succeeded creates the attribution row.
        await insertReferralAttributionIfEligible(admin, paymentIntent.metadata.commitment_id);
      }
    }

    if (event.type === "setup_intent.succeeded") {
      const setupIntent = event.data.object as {
        id: string;
        payment_method?: string | null;
        customer?: string | null;
        metadata?: { commitment_id?: string };
      };

      if (setupIntent.metadata?.commitment_id) {
        const admin = createAdminClient();

        await admin
          .from("commitments")
          .update({
            payment_status: "setup_complete",
            stripe_setup_intent_id: setupIntent.id,
            stripe_payment_method_id: setupIntent.payment_method || null,
            stripe_customer_id: setupIntent.customer || null,
          })
          .eq("id", setupIntent.metadata.commitment_id);
      }
    }

    // Cancel commitments the moment Stripe tells us the buyer's payment will not happen.
    // The lot trigger then subtracts their quantity from committed_quantity_kg, so abandoned
    // carts can't drag a successful campaign into "failed" at settlement time.
    if (event.type === "checkout.session.expired") {
      const session = event.data.object as { id: string };
      const admin = createAdminClient();
      await admin
        .from("commitments")
        .update({
          status: "cancelled",
          payment_status: "cancelled",
          payment_error: "Checkout session expired before completion",
        })
        .eq("stripe_checkout_session_id", session.id)
        .neq("status", "confirmed");
    }

    if (event.type === "payment_intent.payment_failed") {
      const paymentIntent = event.data.object as {
        id: string;
        last_payment_error?: { message?: string } | null;
        metadata?: { commitment_id?: string };
      };
      const errorMessage =
        paymentIntent.last_payment_error?.message || "Payment failed";

      if (paymentIntent.metadata?.commitment_id) {
        const admin = createAdminClient();
        await admin
          .from("commitments")
          .update({
            status: "cancelled",
            payment_status: "charge_failed",
            payment_error: errorMessage,
          })
          .eq("id", paymentIntent.metadata.commitment_id)
          .neq("status", "confirmed");
      } else {
        // Fall back to PI ID lookup if metadata wasn't attached.
        const admin = createAdminClient();
        await admin
          .from("commitments")
          .update({
            status: "cancelled",
            payment_status: "charge_failed",
            payment_error: errorMessage,
          })
          .eq("stripe_payment_intent_id", paymentIntent.id)
          .neq("status", "confirmed");
      }
    }

    if (event.type === "charge.failed") {
      const charge = event.data.object as {
        id: string;
        payment_intent?: string | null;
        failure_message?: string | null;
        metadata?: { commitment_id?: string };
      };
      const errorMessage = charge.failure_message || "Charge failed";
      const admin = createAdminClient();

      if (charge.metadata?.commitment_id) {
        await admin
          .from("commitments")
          .update({
            status: "cancelled",
            payment_status: "charge_failed",
            payment_error: errorMessage,
          })
          .eq("id", charge.metadata.commitment_id)
          .neq("status", "confirmed");
      } else if (charge.payment_intent) {
        await admin
          .from("commitments")
          .update({
            status: "cancelled",
            payment_status: "charge_failed",
            payment_error: errorMessage,
          })
          .eq("stripe_payment_intent_id", charge.payment_intent)
          .neq("status", "confirmed");
      }
    }

    if (event.type === "setup_intent.setup_failed") {
      const setupIntent = event.data.object as {
        id: string;
        last_setup_error?: { message?: string } | null;
        metadata?: { commitment_id?: string };
      };
      const errorMessage =
        setupIntent.last_setup_error?.message || "Payment setup failed";

      if (setupIntent.metadata?.commitment_id) {
        const admin = createAdminClient();
        await admin
          .from("commitments")
          .update({
            status: "cancelled",
            payment_status: "cancelled",
            payment_error: errorMessage,
          })
          .eq("id", setupIntent.metadata.commitment_id)
          .neq("status", "confirmed");
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Webhook processing failed",
      },
      { status: 500 }
    );
  }
}

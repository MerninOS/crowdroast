import { createAdminClient } from "@/lib/supabase/admin";
import { getPaymentIntent, verifyStripeWebhookSignature } from "@/lib/stripe";
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
          updatePayload.payment_status = "charge_failed";
          updatePayload.payment_error = "Checkout completed without paid status";
        }

        await admin
          .from("commitments")
          .update(updatePayload)
          .eq("stripe_checkout_session_id", session.id);
      } else if (session.mode === "setup") {
        const admin = createAdminClient();

        const updatePayload: Record<string, unknown> = {
          payment_status: "setup_complete",
          stripe_setup_intent_id: session.setup_intent || null,
          stripe_customer_id: session.customer || null,
        };

        if (session.payment_method) {
          updatePayload.stripe_payment_method_id = session.payment_method;
        }

        await admin
          .from("commitments")
          .update(updatePayload)
          .eq("stripe_checkout_session_id", session.id);
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

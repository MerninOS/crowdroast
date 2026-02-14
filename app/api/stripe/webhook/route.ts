import { createAdminClient } from "@/lib/supabase/admin";
import { verifyStripeWebhookSignature } from "@/lib/stripe";
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
        customer?: string | null;
        payment_method?: string | null;
      };

      if (session.mode === "setup") {
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

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { render } from "@react-email/render";
import React from "react";

/**
 * "Update your card" email sent between attempts 2 and 3 of the bag-charge
 * retry ladder (AC13).
 *
 * Lifecycle context: the charge worker (`lib/charge-worker.ts`) fires this
 * exactly once per `commitment_bag_charges` row — when `attempt_count`
 * transitions from 1 to 2 (i.e. the SECOND real card attempt just declined,
 * and ONE more retry is still queued ~48h out). The row's
 * `payment_update_email_sent_at` is stamped in the same UPDATE so a re-run of
 * the worker against the same row will not duplicate the send.
 *
 * Mirrors `CardAuthFailed.tsx` structurally on purpose: same body shell, same
 * "summary box" pattern, same single-CTA. The buyer should recognize the
 * shape regardless of which side of settlement they're on.
 */

export interface PaymentUpdateRequiredProps {
  buyerName: string;
  lotTitle: string;
  reason: string;
  manageUrl: string;
}

export function PaymentUpdateRequired({
  buyerName,
  lotTitle,
  reason,
  manageUrl,
}: PaymentUpdateRequiredProps) {
  return (
    <Html>
      <Head />
      <Preview>Your card declined — update it to keep your spot</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>
            Your card just declined — one retry left
          </Heading>
          <Text style={text}>
            Hey {buyerName}, we tried to charge your card for{" "}
            <strong>{lotTitle}</strong> and it bounced — twice now. We&apos;ll
            give it one more shot in about 48 hours, but if the same card
            comes back declined again your spot gets dropped.
          </Text>
          <Text style={text}>
            Best move: update your payment method now so the next retry goes
            through cleanly.
          </Text>

          <Section style={summaryBox}>
            <Text style={summaryItem}>
              <strong>What the bank said:</strong> {reason}
            </Text>
            <Text style={summaryItem}>
              <strong>What to do:</strong> swap in a fresh card on your
              commitment. Takes about thirty seconds.
            </Text>
          </Section>

          <Section style={ctaSection}>
            <Button href={manageUrl} style={button}>
              Update payment
            </Button>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            If the third attempt also fails, your bag in this campaign is
            forfeit and the coffee gets reallocated. Hit reply if anything
            looks sideways and we&apos;ll help sort it out.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderPaymentUpdateRequiredHtml(
  props: PaymentUpdateRequiredProps
): Promise<string> {
  return render(<PaymentUpdateRequired {...props} />);
}

// Styles — mirror CardAuthFailed.tsx for visual continuity in the buyer's
// inbox. Email clients gut most modern CSS, so Mernin' brand styling lives in
// the in-app dashboards, not here.
const body: React.CSSProperties = {
  backgroundColor: "#f6f9f6",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};
const container: React.CSSProperties = {
  backgroundColor: "#ffffff",
  margin: "40px auto",
  padding: "40px",
  borderRadius: "8px",
  maxWidth: "560px",
};
const heading: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: 700,
  color: "#111827",
  margin: "0 0 16px",
};
const text: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "1.6",
  color: "#374151",
  margin: "0 0 12px",
};
const summaryBox: React.CSSProperties = {
  backgroundColor: "#fef2f2",
  borderLeft: "4px solid #e8442a",
  borderRadius: "6px",
  padding: "16px",
  margin: "16px 0",
};
const summaryItem: React.CSSProperties = {
  fontSize: "14px",
  color: "#374151",
  margin: "0 0 6px",
};
const ctaSection: React.CSSProperties = {
  textAlign: "center",
  margin: "32px 0",
};
const button: React.CSSProperties = {
  backgroundColor: "#e8442a",
  color: "#ffffff",
  padding: "12px 28px",
  borderRadius: "6px",
  fontSize: "15px",
  fontWeight: 600,
  textDecoration: "none",
  display: "inline-block",
};
const hr: React.CSSProperties = {
  borderColor: "#e5e7eb",
  margin: "32px 0 16px",
};
const footer: React.CSSProperties = {
  fontSize: "12px",
  color: "#9ca3af",
  margin: "0",
};

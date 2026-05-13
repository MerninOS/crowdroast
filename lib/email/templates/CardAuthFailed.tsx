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
 * Card-auth-probe failure email (AC12 + AC14 fallback messaging).
 *
 * Sent from the `checkout.session.completed` (mode=setup) webhook branch when
 * the post-setup `probeCardAuth` returns `{ ok: false }`. The buyer's
 * commitment row is left in `payment_status = 'setup_complete'` but with
 * `payment_error` set; the settlement-time charge worker reads
 * `payment_error IS NULL` as the auth-OK signal, so this email is the
 * buyer's prompt to update their card before settlement runs.
 */

export interface CardAuthFailedProps {
  buyerName: string;
  lotTitle: string;
  failureReason: string;
  manageUrl: string;
}

export function CardAuthFailed({
  buyerName,
  lotTitle,
  failureReason,
  manageUrl,
}: CardAuthFailedProps) {
  return (
    <Html>
      <Head />
      <Preview>Your card couldn&apos;t be verified — update your payment to keep your spot</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>
            Your card couldn&apos;t be verified
          </Heading>
          <Text style={text}>
            Hey {buyerName}, we tried to verify the card you just saved for{" "}
            <strong>{lotTitle}</strong> and the bank turned us down. Your spot
            in the campaign is still held, but the card needs to clear before
            settlement — otherwise we can&apos;t collect when the bag fills.
          </Text>

          <Section style={summaryBox}>
            <Text style={summaryItem}>
              <strong>What happened:</strong> {failureReason}
            </Text>
            <Text style={summaryItem}>
              <strong>What to do:</strong> update your payment method on your
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
            If you don&apos;t update your card before the campaign settles,
            your commitment may be dropped. Hit reply if anything looks
            sideways and we&apos;ll help sort it out.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderCardAuthFailedHtml(
  props: CardAuthFailedProps
): Promise<string> {
  return render(<CardAuthFailed {...props} />);
}

// Styles — mirror the rest of /lib/email/templates/* for consistent rendering
// in Gmail/Outlook. Visual Mernin' theming is intentionally muted here; email
// clients gut most modern CSS, and the in-app dashboards carry the brand.
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

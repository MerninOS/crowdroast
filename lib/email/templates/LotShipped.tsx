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

export interface LotShippedProps {
  recipientName: string;
  recipientRole: "buyer" | "hub_owner";
  lotTitle: string;
  carrier: string | null;
  trackingNumber: string | null;
  shipmentUrl: string;
}

export function LotShipped({
  recipientName,
  recipientRole,
  lotTitle,
  carrier,
  trackingNumber,
  shipmentUrl,
}: LotShippedProps) {
  const isHubOwner = recipientRole === "hub_owner";

  const previewText = isHubOwner
    ? `Incoming shipment — ${lotTitle} is on its way to your hub`
    : `Your coffee is on its way — ${lotTitle} has shipped`;

  const headingText = isHubOwner ? "Incoming shipment" : "Your coffee is on its way";

  const ctaLabel = isHubOwner ? "View shipment" : "View your order";

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>{headingText}</Heading>
          {isHubOwner ? (
            <Text style={text}>
              Hi {recipientName}, the seller has shipped <strong>{lotTitle}</strong> and
              it&apos;s heading to your hub. Once it arrives, mark it as received so
              buyers know to come pick up their coffee.
            </Text>
          ) : (
            <Text style={text}>
              Hi {recipientName}, great news — <strong>{lotTitle}</strong> has been
              shipped and is on its way to your hub. You&apos;ll receive another
              notification when it arrives and is ready for pickup.
            </Text>
          )}

          {(carrier || trackingNumber) && (
            <Section style={summaryBox}>
              {carrier && (
                <Text style={summaryItem}>
                  <strong>Carrier:</strong> {carrier}
                </Text>
              )}
              {trackingNumber && (
                <Text style={summaryItem}>
                  <strong>Tracking number:</strong> {trackingNumber}
                </Text>
              )}
            </Section>
          )}

          <Section style={ctaSection}>
            <Button href={shipmentUrl} style={button}>
              {ctaLabel}
            </Button>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            You&apos;re receiving this because you&apos;re involved in a lot on CrowdRoast.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderLotShippedHtml(props: LotShippedProps): Promise<string> {
  return render(<LotShipped {...props} />);
}

// Styles
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
  fontWeight: "700",
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
  backgroundColor: "#f9fafb",
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
  color: "#f5f0d8",
  padding: "12px 28px",
  borderRadius: "6px",
  fontSize: "15px",
  fontWeight: "600",
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

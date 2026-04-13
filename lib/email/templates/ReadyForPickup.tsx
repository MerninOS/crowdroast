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

export interface ReadyForPickupProps {
  buyerName: string;
  lotTitle: string;
  hubName: string;
  hubAddress: string;
  pickupUrl: string;
}

export function ReadyForPickup({
  buyerName,
  lotTitle,
  hubName,
  hubAddress,
  pickupUrl,
}: ReadyForPickupProps) {
  return (
    <Html>
      <Head />
      <Preview>Your coffee has landed at {hubName} — come pick it up</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>Your coffee is ready for pickup</Heading>
          <Text style={text}>
            Hi {buyerName}, <strong>{lotTitle}</strong> has arrived at{" "}
            <strong>{hubName}</strong>. Head over to pick up your coffee whenever
            you&apos;re ready.
          </Text>

          <Section style={summaryBox}>
            <Text style={summaryItem}>
              <strong>Hub:</strong> {hubName}
            </Text>
            <Text style={summaryItem}>
              <strong>Address:</strong> {hubAddress}
            </Text>
          </Section>

          <Section style={ctaSection}>
            <Button href={pickupUrl} style={button}>
              View your order
            </Button>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            You&apos;re receiving this because you have a commitment on CrowdRoast.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderReadyForPickupHtml(props: ReadyForPickupProps): Promise<string> {
  return render(<ReadyForPickup {...props} />);
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

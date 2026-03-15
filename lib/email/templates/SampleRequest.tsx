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

export interface SampleItem {
  lotTitle: string;
  quantityGrams: number;
  notes?: string | null;
}

export interface SampleRequestProps {
  sellerName: string;
  hubOwnerName: string;
  hubOwnerCompany: string | null;
  shippingAddress: string;
  sampleItems: SampleItem[];
  samplesUrl: string;
}

export function SampleRequest({
  sellerName,
  hubOwnerName,
  hubOwnerCompany,
  shippingAddress,
  sampleItems,
  samplesUrl,
}: SampleRequestProps) {
  const fromLabel = hubOwnerCompany
    ? `${hubOwnerName} (${hubOwnerCompany})`
    : hubOwnerName;

  return (
    <Html>
      <Head />
      <Preview>New sample request from {fromLabel}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>New Sample Request</Heading>
          <Text style={text}>
            Hi {sellerName}, you have a new sample request from{" "}
            <strong>{fromLabel}</strong>.
          </Text>

          <Heading as="h2" style={subheading}>Samples Requested</Heading>
          {sampleItems.map((item, i) => (
            <Section key={i} style={itemRow}>
              <Text style={itemTitle}>{item.lotTitle}</Text>
              <Text style={itemDetail}>Quantity: {item.quantityGrams}g</Text>
              {item.notes && (
                <Text style={itemDetail}>Notes: {item.notes}</Text>
              )}
            </Section>
          ))}

          <Heading as="h2" style={subheading}>Ship Samples To</Heading>
          <Text style={addressBlock}>{shippingAddress}</Text>

          <Section style={ctaSection}>
            <Button href={samplesUrl} style={button}>
              View sample requests
            </Button>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            Log in to your CrowdRoast seller account to manage and fulfill this request.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderSampleRequestHtml(props: SampleRequestProps): Promise<string> {
  return render(<SampleRequest {...props} />);
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
const subheading: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: "600",
  color: "#111827",
  margin: "24px 0 8px",
};
const text: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "1.6",
  color: "#374151",
  margin: "0 0 12px",
};
const itemRow: React.CSSProperties = {
  backgroundColor: "#f9fafb",
  borderRadius: "6px",
  padding: "12px 16px",
  marginBottom: "8px",
};
const itemTitle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: "600",
  color: "#111827",
  margin: "0 0 4px",
};
const itemDetail: React.CSSProperties = {
  fontSize: "13px",
  color: "#6b7280",
  margin: "0",
};
const addressBlock: React.CSSProperties = {
  fontSize: "14px",
  color: "#374151",
  backgroundColor: "#f9fafb",
  borderRadius: "6px",
  padding: "12px 16px",
  margin: "0 0 24px",
  whiteSpace: "pre-line",
};
const ctaSection: React.CSSProperties = {
  textAlign: "center",
  margin: "32px 0",
};
const button: React.CSSProperties = {
  backgroundColor: "#10b981",
  color: "#ffffff",
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

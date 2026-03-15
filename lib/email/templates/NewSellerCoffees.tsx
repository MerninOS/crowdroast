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

export interface NewLotItem {
  title: string;
  originCountry: string;
  pricePerKg: number;
  currency: string;
}

export interface NewSellerCoffeesProps {
  hubOwnerName: string;
  sellerName: string;
  newLots: NewLotItem[];
  catalogUrl: string;
}

export function NewSellerCoffees({
  hubOwnerName,
  sellerName,
  newLots,
  catalogUrl,
}: NewSellerCoffeesProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {sellerName} has added {String(newLots.length)} new coffee{newLots.length !== 1 ? "s" : ""}
      </Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>New coffees from {sellerName}</Heading>
          <Text style={text}>
            Hi {hubOwnerName}, <strong>{sellerName}</strong> has added{" "}
            {newLots.length} new coffee lot{newLots.length !== 1 ? "s" : ""}{" "}
            to the platform. Browse them to see if you'd like to add any to your
            hub's catalog.
          </Text>

          <Heading as="h2" style={subheading}>New Lots</Heading>
          {newLots.map((lot, i) => (
            <Section key={i} style={itemRow}>
              <Text style={itemTitle}>{lot.title}</Text>
              <Text style={itemDetail}>
                {lot.originCountry} &middot;{" "}
                {lot.currency} {lot.pricePerKg.toFixed(2)}/kg
              </Text>
            </Section>
          ))}

          <Section style={ctaSection}>
            <Button href={catalogUrl} style={button}>
              View in catalog
            </Button>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            You're receiving this because you have an existing relationship with
            this seller on CrowdRoast.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderNewSellerCoffeesHtml(props: NewSellerCoffeesProps): Promise<string> {
  return render(<NewSellerCoffees {...props} />);
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

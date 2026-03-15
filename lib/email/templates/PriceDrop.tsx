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

// ---------------------------------------------------------------------------
// Investor variant (AC-8b) — already has a commitment
// ---------------------------------------------------------------------------

export interface PriceDropInvestorProps {
  buyerName: string;
  lotTitle: string;
  oldPricePerKg: number;
  newPricePerKg: number;
  currency: string;
  catalogUrl: string;
}

export function PriceDropInvestor({
  buyerName,
  lotTitle,
  oldPricePerKg,
  newPricePerKg,
  currency,
  catalogUrl,
}: PriceDropInvestorProps) {
  return (
    <Html>
      <Head />
      <Preview>Price drop on {lotTitle} — you can buy more</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>Price dropped on {lotTitle}</Heading>
          <Text style={text}>
            Hi {buyerName}, great news — <strong>{lotTitle}</strong> has hit a new
            volume milestone and the price has dropped.
          </Text>
          <Text style={text}>
            As an existing investor, you can now purchase additional quantity at the
            lower price.
          </Text>

          <Section style={summaryBox}>
            <Text style={summaryItem}>
              <strong>Previous price:</strong>{" "}
              <span style={strikethrough}>
                {currency} {oldPricePerKg.toFixed(2)}/kg
              </span>
            </Text>
            <Text style={summaryItem}>
              <strong>New price:</strong>{" "}
              <span style={newPrice}>
                {currency} {newPricePerKg.toFixed(2)}/kg
              </span>
            </Text>
          </Section>

          <Section style={ctaSection}>
            <Button href={catalogUrl} style={button}>
              Buy more at the new price
            </Button>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            You're receiving this because you have an active commitment on this lot
            on CrowdRoast.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// ---------------------------------------------------------------------------
// Non-investor variant (AC-8c) — hasn't committed yet
// ---------------------------------------------------------------------------

export interface PriceDropNonInvestorProps {
  buyerName: string;
  lotTitle: string;
  oldPricePerKg: number;
  newPricePerKg: number;
  currency: string;
  deadline: string;
  catalogUrl: string;
}

export function PriceDropNonInvestor({
  buyerName,
  lotTitle,
  oldPricePerKg,
  newPricePerKg,
  currency,
  deadline,
  catalogUrl,
}: PriceDropNonInvestorProps) {
  return (
    <Html>
      <Head />
      <Preview>Price just dropped on {lotTitle}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>Price just dropped — now&apos;s your chance</Heading>
          <Text style={text}>
            Hi {buyerName}, <strong>{lotTitle}</strong> has hit a volume milestone and
            the price has dropped. This might be the right moment to commit.
          </Text>

          <Section style={summaryBox}>
            <Text style={summaryItem}>
              <strong>Previous price:</strong>{" "}
              <span style={strikethrough}>
                {currency} {oldPricePerKg.toFixed(2)}/kg
              </span>
            </Text>
            <Text style={summaryItem}>
              <strong>New price:</strong>{" "}
              <span style={newPrice}>
                {currency} {newPricePerKg.toFixed(2)}/kg
              </span>
            </Text>
            <Text style={summaryItem}>
              <strong>Campaign deadline:</strong> {deadline}
            </Text>
          </Section>

          <Section style={ctaSection}>
            <Button href={catalogUrl} style={button}>
              Commit at the new price
            </Button>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            You're receiving this because you're a member of a hub on CrowdRoast that
            has this lot in its catalog.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderPriceDropInvestorHtml(
  props: PriceDropInvestorProps
): Promise<string> {
  return render(<PriceDropInvestor {...props} />);
}

export async function renderPriceDropNonInvestorHtml(
  props: PriceDropNonInvestorProps
): Promise<string> {
  return render(<PriceDropNonInvestor {...props} />);
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
const strikethrough: React.CSSProperties = {
  textDecoration: "line-through",
  color: "#9ca3af",
};
const newPrice: React.CSSProperties = {
  color: "#10b981",
  fontWeight: "600",
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

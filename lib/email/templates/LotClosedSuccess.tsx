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
// Buyer variant (AC-6a)
// ---------------------------------------------------------------------------

export interface LotClosedBuyerProps {
  buyerName: string;
  lotTitle: string;
  quantityKg: number;
  totalPrice: number;
  currency: string;
  orderUrl: string;
}

export function LotClosedBuyer({
  buyerName,
  lotTitle,
  quantityKg,
  totalPrice,
  currency,
  orderUrl,
}: LotClosedBuyerProps) {
  return (
    <Html>
      <Head />
      <Preview>Your order for {lotTitle} has been confirmed</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>Your order is confirmed</Heading>
          <Text style={text}>
            Hi {buyerName}, great news — the <strong>{lotTitle}</strong> campaign has
            successfully closed. Your order has been processed and the seller will be
            preparing your coffee shortly.
          </Text>

          <Section style={summaryBox}>
            <Text style={summaryItem}>
              <strong>Lot:</strong> {lotTitle}
            </Text>
            <Text style={summaryItem}>
              <strong>Quantity:</strong> {quantityKg.toFixed(1)} kg
            </Text>
            <Text style={summaryItem}>
              <strong>Total paid:</strong> {currency} {totalPrice.toFixed(2)}
            </Text>
          </Section>

          <Section style={ctaSection}>
            <Button href={orderUrl} style={button}>
              View your order
            </Button>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            You're receiving this because you made a commitment on CrowdRoast.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// ---------------------------------------------------------------------------
// Seller variant (AC-6b)
// ---------------------------------------------------------------------------

export interface LotClosedSellerProps {
  sellerName: string;
  lotTitle: string;
  totalQuantityKg: number;
  hubAddress: string;
  fulfillmentUrl: string;
}

export function LotClosedSeller({
  sellerName,
  lotTitle,
  totalQuantityKg,
  hubAddress,
  fulfillmentUrl,
}: LotClosedSellerProps) {
  return (
    <Html>
      <Head />
      <Preview>Your lot {lotTitle} has closed — prepare for shipment</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>Your lot has closed successfully</Heading>
          <Text style={text}>
            Congratulations {sellerName}! Your lot <strong>{lotTitle}</strong> has
            reached its funding goal. Please prepare your shipment as soon as possible.
          </Text>

          <Section style={summaryBox}>
            <Text style={summaryItem}>
              <strong>Lot:</strong> {lotTitle}
            </Text>
            <Text style={summaryItem}>
              <strong>Total quantity sold:</strong> {totalQuantityKg.toFixed(1)} kg
            </Text>
            <Text style={summaryItem}>
              <strong>Ship to:</strong> {hubAddress}
            </Text>
          </Section>

          <Section style={ctaSection}>
            <Button href={fulfillmentUrl} style={button}>
              Manage fulfillment
            </Button>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            You're receiving this because you have an active lot on CrowdRoast.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// ---------------------------------------------------------------------------
// Hub owner variant (AC-6c)
// ---------------------------------------------------------------------------

export interface LotClosedHubOwnerProps {
  hubOwnerName: string;
  lotTitle: string;
  hubName: string;
  dashboardUrl: string;
}

export function LotClosedHubOwner({
  hubOwnerName,
  lotTitle,
  hubName,
  dashboardUrl,
}: LotClosedHubOwnerProps) {
  return (
    <Html>
      <Head />
      <Preview>A lot in {hubName} has closed — your payout is on the way</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>Payout incoming for {hubName}</Heading>
          <Text style={text}>
            Hi {hubOwnerName}, <strong>{lotTitle}</strong> has successfully closed in
            your hub. Your payout has been triggered automatically and will be
            deposited to your connected account.
          </Text>
          <Text style={text}>
            You'll receive another notification once the seller ships the coffee to{" "}
            {hubName}.
          </Text>

          <Section style={ctaSection}>
            <Button href={dashboardUrl} style={button}>
              View your dashboard
            </Button>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            You're receiving this because you're a hub owner on CrowdRoast.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderLotClosedBuyerHtml(props: LotClosedBuyerProps): Promise<string> {
  return render(<LotClosedBuyer {...props} />);
}

export async function renderLotClosedSellerHtml(props: LotClosedSellerProps): Promise<string> {
  return render(<LotClosedSeller {...props} />);
}

export async function renderLotClosedHubOwnerHtml(
  props: LotClosedHubOwnerProps
): Promise<string> {
  return render(<LotClosedHubOwner {...props} />);
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

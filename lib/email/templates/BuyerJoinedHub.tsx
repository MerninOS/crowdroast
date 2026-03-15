import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Text,
} from "@react-email/components";
import { render } from "@react-email/render";
import React from "react";

export interface BuyerJoinedHubProps {
  hubOwnerName: string;
  hubName: string;
  buyerName: string;
  buyerCompany: string | null;
}

export function BuyerJoinedHub({
  hubOwnerName,
  hubName,
  buyerName,
  buyerCompany,
}: BuyerJoinedHubProps) {
  const buyerLabel = buyerCompany ? `${buyerName} (${buyerCompany})` : buyerName;

  return (
    <Html>
      <Head />
      <Preview>{buyerName} has joined your hub</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>New buyer joined {hubName}</Heading>
          <Text style={text}>
            Hi {hubOwnerName}, <strong>{buyerLabel}</strong> has joined your hub.
          </Text>
          <Text style={text}>
            They now have access to the lots you've curated in your catalog.
            No action is required from you.
          </Text>
          <Hr style={hr} />
          <Text style={footer}>
            You're receiving this because you are a hub owner on CrowdRoast.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderBuyerJoinedHubHtml(props: BuyerJoinedHubProps): Promise<string> {
  return render(<BuyerJoinedHub {...props} />);
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
const hr: React.CSSProperties = {
  borderColor: "#e5e7eb",
  margin: "32px 0 16px",
};
const footer: React.CSSProperties = {
  fontSize: "12px",
  color: "#9ca3af",
  margin: "0",
};

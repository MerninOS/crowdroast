import {
  Body,
  Button,
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

export interface HubAccessApprovedProps {
  buyerName: string;
  hubName: string;
  dashboardUrl: string;
}

export function HubAccessApproved({
  buyerName,
  hubName,
  dashboardUrl,
}: HubAccessApprovedProps) {
  return (
    <Html>
      <Head />
      <Preview>You're in — welcome to {hubName}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>Welcome to {hubName}</Heading>
          <Text style={text}>
            Hi {buyerName}, your request to join <strong>{hubName}</strong> has
            been approved. You can now browse and commit to lots.
          </Text>
          <Button style={button} href={dashboardUrl}>
            Browse Lots
          </Button>
          <Hr style={hr} />
          <Text style={footer}>
            You're receiving this because you requested access to a hub on CrowdRoast.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderHubAccessApprovedHtml(
  props: HubAccessApprovedProps
): Promise<string> {
  return render(<HubAccessApproved {...props} />);
}

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
const button: React.CSSProperties = {
  backgroundColor: "#E8442A",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: "600",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "block",
  padding: "12px 24px",
  margin: "24px 0",
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

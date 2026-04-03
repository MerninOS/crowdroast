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

export interface HubAccessDeniedProps {
  buyerName: string;
  hubName: string;
  findHubUrl: string;
}

export function HubAccessDenied({
  buyerName,
  hubName,
  findHubUrl,
}: HubAccessDeniedProps) {
  return (
    <Html>
      <Head />
      <Preview>Update on your request to join {hubName}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>Request update</Heading>
          <Text style={text}>
            Hi {buyerName}, your request to join <strong>{hubName}</strong> was
            not approved at this time.
          </Text>
          <Text style={text}>
            You can still browse and request access to other hubs.
          </Text>
          <Button style={button} href={findHubUrl}>
            Find a Hub
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

export async function renderHubAccessDeniedHtml(
  props: HubAccessDeniedProps
): Promise<string> {
  return render(<HubAccessDenied {...props} />);
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

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

export interface HubAccessRequestProps {
  hubOwnerName: string;
  hubName: string;
  buyerName: string;
  buyerCompany: string | null;
  buyerEmail: string;
  membersUrl: string;
}

export function HubAccessRequest({
  hubOwnerName,
  hubName,
  buyerName,
  buyerCompany,
  buyerEmail,
  membersUrl,
}: HubAccessRequestProps) {
  const buyerLabel = buyerCompany ? `${buyerName} (${buyerCompany})` : buyerName;

  return (
    <Html>
      <Head />
      <Preview>{buyerName} wants to join {hubName}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>New access request for {hubName}</Heading>
          <Text style={text}>
            Hi {hubOwnerName}, <strong>{buyerLabel}</strong> ({buyerEmail}) is
            requesting to join your hub.
          </Text>
          <Text style={text}>
            Head to your members page to approve or deny this request.
          </Text>
          <Button style={button} href={membersUrl}>
            View Request
          </Button>
          <Hr style={hr} />
          <Text style={footer}>
            You're receiving this because you are a hub owner on CrowdRoast.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderHubAccessRequestHtml(
  props: HubAccessRequestProps
): Promise<string> {
  return render(<HubAccessRequest {...props} />);
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

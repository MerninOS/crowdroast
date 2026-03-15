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

export interface SellerInviteProps {
  recipientEmail: string;
  invitedByName: string;
  signupUrl: string;
}

export function SellerInvite({ recipientEmail, invitedByName, signupUrl }: SellerInviteProps) {
  return (
    <Html>
      <Head />
      <Preview>You've been invited to sell your coffee on CrowdRoast</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>You're invited to sell on CrowdRoast</Heading>
          <Text style={text}>
            You have been invited to join CrowdRoast as a seller. CrowdRoast
            connects green coffee producers and importers with roasters through
            group buying campaigns.
          </Text>

          <Heading as="h2" style={subheading}>Why sell on CrowdRoast?</Heading>
          <Text style={text}>
            <strong>Larger purchases</strong> — buyers pool commitments to purchase
            whole lots, meaning larger, more reliable orders for you.
          </Text>
          <Text style={text}>
            <strong>Direct relationships</strong> — connect with roasters and importers
            who care about quality and traceability.
          </Text>
          <Text style={text}>
            <strong>Fair pricing</strong> — set your own price and get paid
            automatically when a lot closes.
          </Text>

          <Section style={ctaSection}>
            <Button href={signupUrl} style={button}>
              Create your seller account
            </Button>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            This invitation was sent to {recipientEmail}. If you didn't expect
            this email, you can safely ignore it.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderSellerInviteHtml(props: SellerInviteProps): Promise<string> {
  return render(<SellerInvite {...props} />);
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

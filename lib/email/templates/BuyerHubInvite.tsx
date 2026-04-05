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

export interface BuyerHubInviteProps {
  recipientEmail: string;
  invitedByName: string;
  hubName: string;
  signupUrl: string;
}

export function BuyerHubInvite({
  recipientEmail,
  invitedByName,
  hubName,
  signupUrl,
}: BuyerHubInviteProps) {
  return (
    <Html>
      <Head />
      <Preview>{"You've been invited to join "}{hubName}{" on CrowdRoast"}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>{"You're invited to join "}{hubName}</Heading>
          <Text style={text}>
            {invitedByName} has invited you to join their hub on CrowdRoast.
            CrowdRoast connects roasters and coffee buyers with green coffee
            producers through group buying campaigns.
          </Text>
          <Text style={text}>
            As a hub member {"you'll"} get access to {invitedByName}{"'s"} curated
            selection of green coffees and can commit to lots alongside other
            buyers to unlock better pricing.
          </Text>

          <Section style={ctaSection}>
            <Button href={signupUrl} style={button}>
              Create your account and join {hubName}
            </Button>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            This invitation was sent to {recipientEmail} by {invitedByName}. If
            you {"didn't"} expect this email, you can safely ignore it.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderBuyerHubInviteHtml(
  props: BuyerHubInviteProps
): Promise<string> {
  return render(<BuyerHubInvite {...props} />);
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
const ctaSection: React.CSSProperties = {
  textAlign: "center",
  margin: "32px 0",
};
const button: React.CSSProperties = {
  backgroundColor: "#e8442a",
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

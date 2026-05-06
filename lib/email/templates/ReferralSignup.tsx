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

export interface ReferralSignupProps {
  inviterName: string;
  inviteeName: string;
  inviteeCompany: string | null;
  hubName: string;
}

export function ReferralSignup({
  inviterName,
  inviteeName,
  inviteeCompany,
  hubName,
}: ReferralSignupProps) {
  const inviteeLabel = inviteeCompany ? `${inviteeName} (${inviteeCompany})` : inviteeName;

  return (
    <Html>
      <Head />
      <Preview>{inviteeName} joined {hubName} via your invite</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>Your friend just joined ☕</Heading>
          <Text style={text}>
            Hi {inviterName}, <strong>{inviteeLabel}</strong> joined{" "}
            <strong>{hubName}</strong> via your invite link.
          </Text>
          <Text style={text}>
            When their first commitment closes successfully, you'll earn{" "}
            <strong>$10 in credits</strong> — they auto-apply to your next commit.
          </Text>
          <Hr style={hr} />
          <Text style={footer}>
            You're receiving this because someone signed up using your invite link on CrowdRoast.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderReferralSignupHtml(props: ReferralSignupProps): Promise<string> {
  return render(<ReferralSignup {...props} />);
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
const hr: React.CSSProperties = {
  borderColor: "#e5e7eb",
  margin: "32px 0 16px",
};
const footer: React.CSSProperties = {
  fontSize: "12px",
  color: "#9ca3af",
  margin: "0",
};

import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Text,
} from "@react-email/components";
import { render } from "@react-email/render";
import React from "react";

export interface ReferralCreditEarnedProps {
  inviterName: string;
  inviteeName: string;
  lotTitle: string | null;
  dashboardUrl: string;
}

export function ReferralCreditEarned({
  inviterName,
  inviteeName,
  lotTitle,
  dashboardUrl,
}: ReferralCreditEarnedProps) {
  const lotPhrase = lotTitle ? ` on ${lotTitle}` : "";

  return (
    <Html>
      <Head />
      <Preview>You earned $10 in credits — auto-applies to your next commit</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>Lot closed. You earned $10 ☕</Heading>
          <Text style={text}>
            Hi {inviterName}, <strong>{inviteeName}</strong>'s commitment{lotPhrase}{" "}
            just settled successfully.
          </Text>
          <Text style={text}>
            You've earned <strong>$10 in CrowdRoast credits</strong>. They'll
            auto-apply to your next commit at settlement — nothing to do, just
            commit on coffee you were going to buy anyway.
          </Text>
          <Text style={text}>
            <Link href={dashboardUrl} style={link}>
              View your balance
            </Link>
          </Text>
          <Hr style={hr} />
          <Text style={footer}>
            You're receiving this because you invited a friend who just settled their first lot on CrowdRoast.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderReferralCreditEarnedHtml(
  props: ReferralCreditEarnedProps
): Promise<string> {
  return render(<ReferralCreditEarned {...props} />);
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
const link: React.CSSProperties = {
  color: "#E8442A",
  fontWeight: 700,
  textDecoration: "underline",
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

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

export interface LotClosedFailedProps {
  recipientName: string;
  lotTitle: string;
}

export function LotClosedFailed({ recipientName, lotTitle }: LotClosedFailedProps) {
  return (
    <Html>
      <Head />
      <Preview>The {lotTitle} campaign did not reach its funding goal</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>Campaign ended without funding</Heading>
          <Text style={text}>Hi {recipientName},</Text>
          <Text style={text}>
            Unfortunately, the <strong>{lotTitle}</strong> campaign did not reach its
            minimum funding goal by the deadline. No sale was triggered.
          </Text>
          <Text style={text}>
            All committed funds have been returned to the buyers. No charges have been
            processed for this lot.
          </Text>
          <Text style={text}>
            Thank you for your participation on CrowdRoast. New lots are added regularly
            — check back to find your next opportunity.
          </Text>

          <Hr style={hr} />
          <Text style={footer}>
            You're receiving this because you were involved in the {lotTitle} campaign
            on CrowdRoast.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderLotClosedFailedHtml(props: LotClosedFailedProps): Promise<string> {
  return render(<LotClosedFailed {...props} />);
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

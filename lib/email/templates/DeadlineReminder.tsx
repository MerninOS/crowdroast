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

export interface DeadlineReminderProps {
  buyerName: string;
  lotTitle: string;
  hubName: string;
  deadline: string;
  pricePerKg: number;
  currency: string;
  catalogUrl: string;
}

export function DeadlineReminder({
  buyerName,
  lotTitle,
  hubName,
  deadline,
  pricePerKg,
  currency,
  catalogUrl,
}: DeadlineReminderProps) {
  return (
    <Html>
      <Head />
      <Preview>24 hours left to commit on {lotTitle}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>Don't miss out — 24 hours left</Heading>
          <Text style={text}>
            Hi {buyerName}, the <strong>{lotTitle}</strong> campaign in{" "}
            <strong>{hubName}</strong> closes in 24 hours. This is your last chance to
            commit before the deadline.
          </Text>

          <Section style={summaryBox}>
            <Text style={summaryItem}>
              <strong>Lot:</strong> {lotTitle}
            </Text>
            <Text style={summaryItem}>
              <strong>Price:</strong> {currency} {pricePerKg.toFixed(2)}/kg
            </Text>
            <Text style={summaryItem}>
              <strong>Deadline:</strong> {deadline}
            </Text>
          </Section>

          <Section style={ctaSection}>
            <Button href={catalogUrl} style={button}>
              Commit now
            </Button>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            You're receiving this because you're a member of {hubName} on CrowdRoast
            and have not yet committed to this lot.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderDeadlineReminderHtml(
  props: DeadlineReminderProps
): Promise<string> {
  return render(<DeadlineReminder {...props} />);
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

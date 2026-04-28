import { Button, Hr, Section, Text } from "@react-email/components";
import React from "react";

export interface AwaitingRelistCTAProps {
  lotTitle: string;
  reviewUrl: string;
}

/**
 * Shared CTA block dropped into seller terminal-state emails (settled,
 * failed, expired). Reminds the seller their lot is now in the review
 * queue and links to /dashboard/seller/lots#needs-review where they can
 * relist or shelve.
 */
export function AwaitingRelistCTA({ lotTitle, reviewUrl }: AwaitingRelistCTAProps) {
  return (
    <Section style={section}>
      <Hr style={hr} />
      <Text style={text}>
        <strong>What's next for {lotTitle}?</strong>
      </Text>
      <Text style={subtext}>
        We've moved it to your <strong>Needs Review</strong> queue. Open it to
        edit the lot, then choose to relist it on the marketplace or shelve it
        as a draft.
      </Text>
      <Section style={ctaSection}>
        <Button href={reviewUrl} style={button}>
          Review your lot
        </Button>
      </Section>
    </Section>
  );
}

const section: React.CSSProperties = {
  margin: "24px 0 0",
};
const hr: React.CSSProperties = {
  borderColor: "#e5e7eb",
  margin: "0 0 20px",
};
const text: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "1.6",
  color: "#111827",
  margin: "0 0 8px",
};
const subtext: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "1.6",
  color: "#374151",
  margin: "0 0 12px",
};
const ctaSection: React.CSSProperties = {
  textAlign: "center",
  margin: "16px 0 0",
};
const button: React.CSSProperties = {
  backgroundColor: "#1c0f05",
  color: "#f5f0d8",
  padding: "12px 24px",
  borderRadius: "9999px",
  fontSize: "13px",
  fontWeight: "700",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  textDecoration: "none",
  display: "inline-block",
  border: "2px solid #1c0f05",
};

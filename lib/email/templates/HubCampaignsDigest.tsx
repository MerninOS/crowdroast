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

export interface DigestCampaignItem {
  lotTitle: string;
  originCountry: string;
  pricePerKg: number;
  currency: string;
  /** Pre-formatted "Mar 14, 2026" — formatting on the cron side keeps the template pure. */
  deadlineLabel: string;
}

export interface DigestHubGroup {
  hubName: string;
  campaigns: DigestCampaignItem[];
}

export interface HubCampaignsDigestProps {
  buyerName: string;
  /** Window the digest covers, e.g. "over the last few days" */
  windowLabel: string;
  hubs: DigestHubGroup[];
  browseUrl: string;
  totalCampaigns: number;
}

export function HubCampaignsDigest({
  buyerName,
  windowLabel,
  hubs,
  browseUrl,
  totalCampaigns,
}: HubCampaignsDigestProps) {
  const hubCount = hubs.length;
  return (
    <Html>
      <Head />
      <Preview>
        {`${totalCampaigns} new campaign${totalCampaigns !== 1 ? "s" : ""} ${hubCount > 1 ? `across ${hubCount} hubs` : ""}`}
      </Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>New campaigns are live</Heading>
          <Text style={text}>
            Hi {buyerName}, here's what's opened up {windowLabel}.{" "}
            <strong>
              {totalCampaigns} new campaign{totalCampaigns !== 1 ? "s" : ""}
            </strong>{" "}
            {hubCount > 1
              ? `across ${hubCount} of your hubs`
              : "are now accepting commitments"}
            . Don't sleep on these — every campaign has a deadline.
          </Text>

          {hubs.map((hub, hi) => (
            <Section key={hi} style={hubSection}>
              <Heading as="h2" style={hubHeading}>
                {hub.hubName}
              </Heading>
              {hub.campaigns.map((c, ci) => (
                <Section key={ci} style={itemRow}>
                  <Text style={itemTitle}>{c.lotTitle}</Text>
                  <Text style={itemDetail}>
                    {c.originCountry} &middot;{" "}
                    {c.currency} {c.pricePerKg.toFixed(2)}/kg
                  </Text>
                  <Text style={itemDeadline}>
                    Closes {c.deadlineLabel}
                  </Text>
                </Section>
              ))}
            </Section>
          ))}

          <Section style={ctaSection}>
            <Button href={browseUrl} style={button}>
              Browse Campaigns
            </Button>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            You're receiving this digest because you're an active member of
            {hubCount > 1 ? " these hubs" : ` ${hubs[0]?.hubName ?? "this hub"}`}{" "}
            on CrowdRoast.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderHubCampaignsDigestHtml(
  props: HubCampaignsDigestProps
): Promise<string> {
  return render(<HubCampaignsDigest {...props} />);
}

const body: React.CSSProperties = {
  backgroundColor: "#f5f0d8",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};
const container: React.CSSProperties = {
  backgroundColor: "#fdfaf0",
  margin: "40px auto",
  padding: "40px",
  borderRadius: "20px",
  border: "4px solid #1c0f05",
  maxWidth: "560px",
};
const heading: React.CSSProperties = {
  fontSize: "28px",
  fontWeight: "800",
  color: "#1c0f05",
  margin: "0 0 16px",
  letterSpacing: "-0.01em",
};
const text: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "1.6",
  color: "#1c0f05",
  margin: "0 0 12px",
};
const hubSection: React.CSSProperties = {
  margin: "24px 0 0",
};
const hubHeading: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: "800",
  color: "#1c0f05",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  margin: "0 0 8px",
  paddingBottom: "6px",
  borderBottom: "2px solid #1c0f05",
};
const itemRow: React.CSSProperties = {
  backgroundColor: "#f5f0d8",
  border: "2px solid #1c0f05",
  borderRadius: "12px",
  padding: "12px 16px",
  marginBottom: "8px",
};
const itemTitle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: "700",
  color: "#1c0f05",
  margin: "0 0 4px",
};
const itemDetail: React.CSSProperties = {
  fontSize: "13px",
  color: "#7a6a50",
  margin: "0 0 4px",
};
const itemDeadline: React.CSSProperties = {
  fontSize: "12px",
  color: "#e8442a",
  fontWeight: "700",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  margin: "0",
};
const ctaSection: React.CSSProperties = {
  textAlign: "center",
  margin: "32px 0",
};
const button: React.CSSProperties = {
  backgroundColor: "#e8442a",
  color: "#f5f0d8",
  padding: "14px 28px",
  borderRadius: "9999px",
  fontSize: "13px",
  fontWeight: "700",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  textDecoration: "none",
  display: "inline-block",
  border: "3px solid #1c0f05",
};
const hr: React.CSSProperties = {
  borderColor: "#d8d0b8",
  margin: "32px 0 16px",
};
const footer: React.CSSProperties = {
  fontSize: "12px",
  color: "#7a6a50",
  margin: "0",
};

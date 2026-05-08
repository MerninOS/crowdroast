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

export interface DigestLotItem {
  title: string;
  originCountry: string;
  pricePerKg: number;
  currency: string;
}

export interface DigestSellerGroup {
  sellerName: string;
  newLots: DigestLotItem[];
}

export interface SellerCoffeesDigestProps {
  hubOwnerName: string;
  /** Window the digest covers, e.g. "in the last 24 hours" */
  windowLabel: string;
  sellers: DigestSellerGroup[];
  catalogUrl: string;
  totalLots: number;
}

export function SellerCoffeesDigest({
  hubOwnerName,
  windowLabel,
  sellers,
  catalogUrl,
  totalLots,
}: SellerCoffeesDigestProps) {
  const sellerCount = sellers.length;
  return (
    <Html>
      <Head />
      <Preview>
        {`${totalLots} new coffee${totalLots !== 1 ? "s" : ""} from ${sellerCount} seller${sellerCount !== 1 ? "s" : ""}`}
      </Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading style={heading}>New coffees from your sellers</Heading>
          <Text style={text}>
            Hi {hubOwnerName}, here's what your sellers added {windowLabel}.
            <strong>
              {" "}{totalLots} new lot{totalLots !== 1 ? "s" : ""}{" "}
            </strong>
            across{" "}
            <strong>
              {sellerCount} seller{sellerCount !== 1 ? "s" : ""}
            </strong>
            .
          </Text>

          {sellers.map((seller, si) => (
            <Section key={si} style={sellerSection}>
              <Heading as="h2" style={sellerHeading}>
                {seller.sellerName}
              </Heading>
              {seller.newLots.map((lot, li) => (
                <Section key={li} style={itemRow}>
                  <Text style={itemTitle}>{lot.title}</Text>
                  <Text style={itemDetail}>
                    {lot.originCountry} &middot;{" "}
                    {lot.currency} {lot.pricePerKg.toFixed(2)}/kg
                  </Text>
                </Section>
              ))}
            </Section>
          ))}

          <Section style={ctaSection}>
            <Button href={catalogUrl} style={button}>
              Browse Catalog
            </Button>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            You're receiving this digest because you have an existing
            relationship with these sellers on CrowdRoast.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderSellerCoffeesDigestHtml(
  props: SellerCoffeesDigestProps
): Promise<string> {
  return render(<SellerCoffeesDigest {...props} />);
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
const sellerSection: React.CSSProperties = {
  margin: "24px 0 0",
};
const sellerHeading: React.CSSProperties = {
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

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

/**
 * Campaign settlement summary email (AC10 / Task 4.13).
 *
 * Sent to a buyer once every `commitment_bag_charges` row tied to their
 * commitment has reached a terminal state (`charged` or `payment_failed`).
 * The worker fires this from `lib/settlement-email-trigger.ts` as a
 * fire-and-forget side-effect after both terminal exit points (charged +
 * payment_failed) — the trigger guards against duplicates via the
 * `commitments.settlement_email_sent_at` atomic stamp (migration #41).
 *
 * Two variants:
 *   1. **Per-bag summary** — when at least one bag-charge row exists.
 *      Shows a per-bag table (Bag # · kg · amount · status) plus aggregate
 *      totals (kg purchased / awaiting / failed).
 *   2. **Campaign failure** — when ZERO bag-charge rows exist (campaign
 *      failed under `min_bags_to_succeed`). Short "didn't reach minimum"
 *      copy with no table.
 *
 * Voice: Mernin' — direct, punchy, slightly silly. Mirrors the structural
 * pattern of CardAuthFailed / PaymentUpdateRequired so the buyer's inbox
 * recognizes the family at a glance. Email clients gut most modern CSS so
 * brand styling is intentionally minimal here; the in-app dashboard carries
 * the loud visual identity.
 */

export type BagRowStatus = "charged" | "payment_failed" | "in_progress";

export interface CampaignSettledBagRow {
  bagNumber: number;
  kg: number;
  amountCents: number;
  /** Settlement-time status. `in_progress` covers awaiting/charging/retry_scheduled — should not appear when the trigger fires correctly but rendered defensively. */
  status: BagRowStatus;
}

export interface CampaignSettledProps {
  buyerName: string;
  lotTitle: string;
  /** Three-letter currency code (e.g. "USD"). Drives the formatter. */
  currency: string;
  /** Per-bag rows, in bag-number order. Empty array → failure variant. */
  bagRows: CampaignSettledBagRow[];
  /** Aggregate totals derived from the rows. Caller does the math so the email is a pure presentation layer. */
  totals: {
    kgPurchased: number;
    kgFailed: number;
    totalChargedCents: number;
  };
  /** Manage-commitment URL on the buyer dashboard. */
  commitmentUrl: string;
}

export function CampaignSettled({
  buyerName,
  lotTitle,
  currency,
  bagRows,
  totals,
  commitmentUrl,
}: CampaignSettledProps) {
  const isFailureVariant = bagRows.length === 0;

  return (
    <Html>
      <Head />
      <Preview>
        {isFailureVariant
          ? `${lotTitle} didn't reach minimum — nothing was charged`
          : `Your ${lotTitle} settlement — here's the breakdown`}
      </Preview>
      <Body style={body}>
        <Container style={container}>
          {isFailureVariant ? (
            <>
              <Heading style={heading}>
                {lotTitle} didn&apos;t hit the minimum
              </Heading>
              <Text style={text}>
                Hey {buyerName}, the campaign for{" "}
                <strong>{lotTitle}</strong> closed without hitting its bag
                minimum. No charges were made to your card — your spot just
                evaporates. Better luck next time.
              </Text>
              <Text style={text}>
                If you saved a card, we&apos;ll keep it on file for the next
                run. Otherwise, head back to the dashboard and see what else
                is brewing.
              </Text>
            </>
          ) : (
            <>
              <Heading style={heading}>
                Your {lotTitle} settlement
              </Heading>
              <Text style={text}>
                Hey {buyerName}, the campaign for{" "}
                <strong>{lotTitle}</strong> closed and we ran the numbers.
                Here&apos;s exactly what hit your card.
              </Text>

              <Section style={summaryBox}>
                <Text style={summaryItem}>
                  <strong>Kg purchased:</strong>{" "}
                  {formatKg(totals.kgPurchased)}
                </Text>
                {totals.kgFailed > 0 ? (
                  <Text style={summaryItem}>
                    <strong>Kg with failed payment:</strong>{" "}
                    {formatKg(totals.kgFailed)}
                  </Text>
                ) : null}
                <Text style={summaryItem}>
                  <strong>Total charged:</strong>{" "}
                  {formatCents(totals.totalChargedCents, currency)}
                </Text>
              </Section>

              <table cellPadding={0} cellSpacing={0} style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Bag</th>
                    <th style={thStyle}>Kg</th>
                    <th style={thStyle}>Amount</th>
                    <th style={thStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bagRows.map((row) => (
                    <tr key={row.bagNumber}>
                      <td style={tdStyle}>Bag {row.bagNumber}</td>
                      <td style={tdStyle}>{formatKg(row.kg)}</td>
                      <td style={tdStyle}>
                        {formatCents(row.amountCents, currency)}
                      </td>
                      <td style={tdStyle}>{statusLabel(row.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <Section style={ctaSection}>
            <Button href={commitmentUrl} style={button}>
              {isFailureVariant ? "Back to dashboard" : "View your order"}
            </Button>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            Questions about a line item? Hit reply — we read every one. If
            anything on this looks off, we&apos;ll sort it.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderCampaignSettledHtml(
  props: CampaignSettledProps
): Promise<string> {
  return render(<CampaignSettled {...props} />);
}

// -------------------------------------------------------------------------
// Formatters
// -------------------------------------------------------------------------

function formatKg(kg: number): string {
  // Match the rest of the codebase — kg are integer-valued at settlement,
  // but render with at most one decimal in case future migrations relax
  // the integer check.
  const n = Number(kg || 0);
  return Number.isInteger(n) ? `${n} kg` : `${n.toFixed(1)} kg`;
}

function formatCents(cents: number, currency: string): string {
  const dollars = Number(cents || 0) / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: (currency || "USD").toUpperCase(),
    }).format(dollars);
  } catch {
    return `$${dollars.toFixed(2)}`;
  }
}

function statusLabel(status: BagRowStatus): string {
  switch (status) {
    case "charged":
      return "Charged";
    case "payment_failed":
      return "Payment failed";
    case "in_progress":
      return "Pending";
  }
}

// -------------------------------------------------------------------------
// Styles — mirror CardAuthFailed.tsx / PaymentUpdateRequired.tsx
// -------------------------------------------------------------------------

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
  fontWeight: 700,
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
  backgroundColor: "#fef7ed",
  borderLeft: "4px solid #e8442a",
  borderRadius: "6px",
  padding: "16px",
  margin: "16px 0",
};
const summaryItem: React.CSSProperties = {
  fontSize: "14px",
  color: "#374151",
  margin: "0 0 6px",
};
const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  margin: "16px 0",
  fontSize: "14px",
  color: "#374151",
};
const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  borderBottom: "2px solid #1c0f05",
  fontSize: "12px",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "#1c0f05",
};
const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #e5e7eb",
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
  fontWeight: 600,
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

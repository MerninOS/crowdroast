// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import type { Commitment, Lot } from "@/lib/types";
import type { CommitmentGroup } from "@/components/buyer-commitments/bucket-by-lifecycle";

// Mock @merninos/ui to avoid the npm-link symlink / dupe-React issue.
vi.mock("@merninos/ui", () => {
  const Pass = ({ children, asChild, ...rest }: any) => <div {...rest}>{children}</div>;
  return { Button: Pass };
});

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// Force kg unit so legacy assertions like "50 kg" / "$9.90/kg" stay stable.
vi.mock("@/components/unit-provider", () => ({
  useUnitPreference: () => ({ unit: "kg", setUnit: () => {} }),
}));

import { RaisingDrawerBody } from "@/components/buyer-commitments/commitment-drawer/raising-body";

function makeCommit(over: Partial<Commitment> = {}): Commitment {
  return {
    id: "c-1",
    lot_id: "lot-1",
    buyer_id: "b-1",
    hub_id: null,
    campaign_id: "camp-1",
    quantity_kg: 50,
    price_per_kg: 10,
    total_price: 550,
    status: "confirmed",
    payment_status: "setup_complete",
    charge_amount_cents: null,
    charge_currency: "usd",
    stripe_checkout_session_id: null,
    stripe_setup_intent_id: null,
    stripe_payment_method_id: null,
    stripe_customer_id: null,
    stripe_payment_intent_id: "pi_x",
    stripe_charge_id: null,
    payment_error: null,
    charged_at: null,
    notes: null,
    picked_up_at: null,
    picked_up_by: null,
    kg_locked_at_settlement: null,
    kg_refunded_at_settlement: null,
    settlement_email_sent_at: null,
    refund_status: "not_refunded",
    refunded_amount_cents: 0,
    refunded_at: null,
    refunded_by: null,
    last_refund_id: null,
    refund_reason: null,
    created_at: "2026-04-15T12:00:00Z",
    updated_at: "2026-04-15T12:00:00Z",
    ...over,
  };
}

function makeLot(over: Partial<Lot> = {}): Lot {
  return {
    id: "lot-1",
    seller_id: "s-1",
    title: "Sample Lot",
    origin_country: "Ethiopia",
    region: "Yirgacheffe",
    farm: null,
    variety: null,
    process: null,
    altitude_min: null,
    altitude_max: null,
    crop_year: null,
    score: null,
    description: null,
    total_quantity_kg: 1000,
    bag_size_kg: null,
    min_bags_to_succeed: 1,
    committed_quantity_kg: 700,
    min_commitment_kg: 600,
    price_per_kg: 10,
    currency: "USD",
    status: "active",
    commitment_deadline: null,
    expiry_date: null,
    settlement_status: "pending",
    settlement_processed_at: null,
    images: [],
    flavor_notes: [],
    certifications: [],
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
    ...over,
  } as Lot;
}

function makeGroup(over: Partial<CommitmentGroup> = {}): CommitmentGroup {
  return {
    groupKey: "g-1",
    lotId: "lot-1",
    campaignId: "camp-1",
    hubId: "hub-1",
    lot: makeLot(),
    campaign: {
      id: "camp-1",
      status: "active",
      deadline: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      settled_at: null,
    },
    commitments: [makeCommit({ id: "c-1", quantity_kg: 50 })],
    shipment: null,
    ...over,
  };
}

describe("RaisingDrawerBody", () => {
  it("renders all summary fields with formatted values (C6)", () => {
    render(
      <RaisingDrawerBody
        group={makeGroup()}
        tiers={[
          { min_quantity_kg: 500, price_per_kg: 10 },
          { min_quantity_kg: 1000, price_per_kg: 9 },
          { min_quantity_kg: 2000, price_per_kg: 8 },
        ]}
      />
    );
    // Each summary stat label appears next to its value — assert by label
    // co-location rather than raw text scan (other "50 kg" / "700 kg" can
    // appear elsewhere on the body).
    expect(screen.getByText("Your commits").nextElementSibling?.textContent).toBe("50 kg");
    expect(screen.getByText("Your exposure").nextElementSibling?.textContent).toBe("$550.00");
    expect(screen.getByText("Campaign total").nextElementSibling?.textContent).toBe("700 kg");
    expect(screen.getByText("Minimum").nextElementSibling?.textContent).toBe("600 kg");
    expect(screen.getByTestId("raising-deadline").textContent).toMatch(/d left|h left/);
  });

  it("renders the urgency callout when below minimum and hides it when at/above (C7)", () => {
    const { rerender } = render(
      <RaisingDrawerBody
        group={makeGroup({ lot: makeLot({ committed_quantity_kg: 599 }) })}
        tiers={[]}
      />
    );
    expect(screen.getByTestId("raising-urgency")).toBeInTheDocument();
    expect(screen.getByTestId("raising-urgency").textContent).toContain("1 kg");

    rerender(
      <RaisingDrawerBody
        group={makeGroup({ lot: makeLot({ committed_quantity_kg: 600 }) })}
        tiers={[]}
      />
    );
    expect(screen.queryByTestId("raising-urgency")).not.toBeInTheDocument();
  });

  it("renders every tier with the correct unlock state and projected savings delta (C8)", () => {
    // Buyer has 50kg, campaign is at 700kg, current tier is the 500kg @ $10 tier ($11/kg with fee).
    render(
      <RaisingDrawerBody
        group={makeGroup({
          lot: makeLot({ committed_quantity_kg: 700, price_per_kg: 10 }),
          commitments: [makeCommit({ quantity_kg: 50 })],
        })}
        tiers={[
          { min_quantity_kg: 500, price_per_kg: 10 },
          { min_quantity_kg: 1000, price_per_kg: 9 },
          { min_quantity_kg: 2000, price_per_kg: 8 },
        ]}
      />
    );

    // 500kg tier: unlocked
    const t500 = screen.getByTestId("raising-tier-500");
    expect(t500.getAttribute("data-unlocked")).toBe("true");

    // 1000kg tier: locked, +$55 if reached ($11 - $9.90) × 50
    const t1000 = screen.getByTestId("raising-tier-1000");
    expect(t1000.getAttribute("data-unlocked")).toBe("false");
    expect(screen.getByTestId("raising-tier-delta-1000").textContent).toContain("$55.00");

    // 2000kg tier: locked, +$150 if reached ($11 - $8.80) × 50
    const t2000 = screen.getByTestId("raising-tier-2000");
    expect(t2000.getAttribute("data-unlocked")).toBe("false");
    expect(screen.getByTestId("raising-tier-delta-2000").textContent).toContain("$110.00");
  });

  it("does not render a tier list when no tiers exist (C8 edge)", () => {
    render(<RaisingDrawerBody group={makeGroup()} tiers={[]} />);
    expect(screen.queryByTestId("raising-tier-list")).not.toBeInTheDocument();
  });

  it("renders Commit more linking to the campaign page with the buyer's hub (C9)", () => {
    render(
      <RaisingDrawerBody
        group={makeGroup({ lotId: "lot-42", hubId: "hub-9" })}
        tiers={[]}
      />
    );
    const link = screen.getByTestId("raising-commit-more");
    expect(link.getAttribute("href")).toBe("/dashboard/buyer/lot/lot-42?hub=hub-9");
  });
});

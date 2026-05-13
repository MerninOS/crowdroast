// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("@/components/unit-provider", () => ({
  useUnitPreference: () => ({ unit: "kg", setUnit: () => {} }),
}));

import type { Commitment, Lot } from "@/lib/types";
import type { CommitmentGroup } from "@/components/buyer-commitments/bucket-by-lifecycle";
import { InMotionDrawerBody } from "@/components/buyer-commitments/commitment-drawer/in-motion-body";

function makeCommit(over: Partial<Commitment> = {}): Commitment {
  return {
    id: "c-1",
    lot_id: "lot-1",
    buyer_id: "b-1",
    hub_id: null,
    campaign_id: "camp-1",
    quantity_kg: 40,
    price_per_kg: 9,
    total_price: 396,
    status: "confirmed",
    payment_status: "charge_succeeded",
    charge_amount_cents: 39600,
    charge_currency: "usd",
    stripe_checkout_session_id: null,
    stripe_setup_intent_id: null,
    stripe_payment_method_id: null,
    stripe_customer_id: null,
    stripe_payment_intent_id: "pi_x",
    stripe_charge_id: null,
    payment_error: null,
    charged_at: "2026-04-15T12:00:00Z",
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
    region: null,
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
    committed_quantity_kg: 800,
    min_commitment_kg: 600,
    price_per_kg: 10,
    currency: "USD",
    status: "active",
    commitment_deadline: null,
    expiry_date: null,
    settlement_status: "settled",
    settlement_processed_at: "2026-04-20T00:00:00Z",
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
      status: "settled",
      deadline: "2026-04-15T00:00:00Z",
      settled_at: "2026-04-20T00:00:00Z",
    },
    commitments: [],
    shipment: { status: "in_transit", carrier: null, tracking_number: null, shipped_at: null, delivered_at: null, hub: null },
    ...over,
  };
}

describe("InMotionDrawerBody", () => {
  it("renders the stage pill from STAGE_META across funds_held / in_transit / at_hub (C10)", () => {
    // funds_held: settled but no shipment
    const fundsHeldGroup = makeGroup({
      shipment: null,
      commitments: [makeCommit()],
    });
    const { rerender } = render(<InMotionDrawerBody group={fundsHeldGroup} />);
    let pill = screen.getByTestId("in-motion-stage-pill");
    expect(pill.getAttribute("data-stage")).toBe("funds_held");
    expect(pill.textContent).toBe("Funds Held");

    // in_transit
    rerender(
      <InMotionDrawerBody
        group={makeGroup({
          shipment: { status: "in_transit", carrier: null, tracking_number: null, shipped_at: null, delivered_at: null, hub: null },
          commitments: [makeCommit()],
        })}
      />
    );
    pill = screen.getByTestId("in-motion-stage-pill");
    expect(pill.getAttribute("data-stage")).toBe("in_transit");
    expect(pill.textContent).toBe("In Transit");

    // at_hub
    rerender(
      <InMotionDrawerBody
        group={makeGroup({
          shipment: { status: "at_hub", carrier: null, tracking_number: null, shipped_at: null, delivered_at: null, hub: null },
          commitments: [makeCommit()],
        })}
      />
    );
    pill = screen.getByTestId("in-motion-stage-pill");
    expect(pill.getAttribute("data-stage")).toBe("at_hub");
    expect(pill.textContent).toBe("At Hub");
  });

  it("renders settled / paid / saved values (C11)", () => {
    // 2 succeeded commitments × 40kg @ $9/kg seller → $9.90 buyer = $396 each = $792 paid
    // base price $10 → $11/kg buyer × 80kg = $880 baseline
    // saved = $880 − $792 = $88
    const group = makeGroup({
      commitments: [makeCommit({ id: "c-1" }), makeCommit({ id: "c-2" })],
    });
    render(<InMotionDrawerBody group={group} />);
    expect(screen.getByTestId("in-motion-stat-settled").textContent).toContain("80 kg");
    expect(screen.getByTestId("in-motion-stat-paid").textContent).toContain("$792.00");
    expect(screen.getByTestId("in-motion-stat-saved").textContent).toContain("$88.00");
  });

  it("falls back to total_price when charge_amount_cents is null (C11)", () => {
    const group = makeGroup({
      commitments: [
        makeCommit({
          charge_amount_cents: null,
          total_price: 100,
          quantity_kg: 10,
        }),
      ],
    });
    render(<InMotionDrawerBody group={group} />);
    expect(screen.getByTestId("in-motion-stat-paid").textContent).toContain("$100.00");
  });

  it("hides the saved value when no savings exist (C11 edge)", () => {
    // No tier hit, paid the base price exactly: charge_amount_cents matches base × kg × 1.10
    const group = makeGroup({
      commitments: [
        makeCommit({
          quantity_kg: 10,
          // base $10 × 1.10 × 10kg = $110
          charge_amount_cents: 11000,
        }),
      ],
    });
    render(<InMotionDrawerBody group={group} />);
    expect(screen.getByTestId("in-motion-stat-saved").textContent).toContain("—");
  });
});

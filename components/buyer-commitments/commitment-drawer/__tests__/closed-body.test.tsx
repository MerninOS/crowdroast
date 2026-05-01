// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("@/components/unit-provider", () => ({
  useUnitPreference: () => ({ unit: "kg", setUnit: () => {} }),
}));

import type { Commitment, Lot } from "@/lib/types";
import type { CommitmentGroup } from "@/components/buyer-commitments/bucket-by-lifecycle";
import { ClosedDrawerBody } from "@/components/buyer-commitments/commitment-drawer/closed-body";

function makeCommit(over: Partial<Commitment> = {}): Commitment {
  return {
    id: "c-1",
    lot_id: "lot-1",
    buyer_id: "b-1",
    hub_id: null,
    campaign_id: "camp-1",
    quantity_kg: 30,
    price_per_kg: 9,
    total_price: 297,
    status: "confirmed",
    payment_status: "charge_succeeded",
    charge_amount_cents: 29700,
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
    picked_up_at: "2026-04-25T12:00:00Z",
    picked_up_by: "b-1",
    refund_status: "not_refunded",
    refunded_amount_cents: 0,
    refunded_at: null,
    refunded_by: null,
    last_refund_id: null,
    refund_reason: null,
    created_at: "2026-04-15T12:00:00Z",
    updated_at: "2026-04-25T12:00:00Z",
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
    total_quantity_kg: 1500,
    committed_quantity_kg: 1100,
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
    updated_at: "2026-04-20T00:00:00Z",
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
    commitments: [makeCommit({ id: "c-1" }), makeCommit({ id: "c-2" })],
    shipment: null,
    ...over,
  };
}

describe("ClosedDrawerBody — value mode", () => {
  it("leads with savings and quantity in the header (C12)", () => {
    // 2 commitments × 30kg @ $9 seller = $9.90 buyer = $297 each = $594 paid
    // base $10 → $11/kg buyer × 60kg = $660 baseline
    // saved = $660 − $594 = $66
    const group = makeGroup();
    render(<ClosedDrawerBody group={group} mode="value" />);
    const header = screen.getByTestId("closed-drawer-header");
    expect(header.textContent).toContain("$66.00");
    expect(header.textContent).toContain("60 kg");
  });

  it("hides the savings line and leads with quantity when savings = 0 (C12 edge)", () => {
    // No tier hit: commitments paid the base price exactly.
    // base $10 × 1.10 × 30kg = $330; charge_amount_cents matches.
    const group = makeGroup({
      commitments: [
        makeCommit({
          quantity_kg: 30,
          charge_amount_cents: 33000,
        }),
      ],
    });
    render(<ClosedDrawerBody group={group} mode="value" />);
    const header = screen.getByTestId("closed-drawer-header");
    expect(header.textContent).not.toContain("You saved");
    expect(header.textContent).toContain("30 kg");
    expect(screen.queryByTestId("closed-savings")).not.toBeInTheDocument();
  });

  it("renders the tier-unlocked summary with threshold and final price (C13)", () => {
    // 2 tiers: 500 @ $10, 1000 @ $9. Campaign settled at 1100 → tier 2 unlocked.
    const group = makeGroup({
      lot: makeLot({ committed_quantity_kg: 1100, price_per_kg: 10 }),
    });
    render(
      <ClosedDrawerBody
        group={group}
        mode="value"
        tiers={[
          { min_quantity_kg: 500, price_per_kg: 10 },
          { min_quantity_kg: 1000, price_per_kg: 9 },
        ]}
      />
    );
    const tierBox = screen.getByTestId("closed-tier-summary");
    expect(tierBox).toBeInTheDocument();
    expect(screen.getByTestId("closed-tier-threshold").textContent).toContain("1,000 kg");
    expect(screen.getByTestId("closed-tier-threshold").textContent).toContain("$9.90/kg");
  });

  it("hides the tier-unlocked summary when no tier was reached (C13 edge)", () => {
    const group = makeGroup({
      lot: makeLot({ committed_quantity_kg: 200 }),
    });
    render(
      <ClosedDrawerBody
        group={group}
        mode="value"
        tiers={[{ min_quantity_kg: 500, price_per_kg: 10 }]}
      />
    );
    expect(screen.queryByTestId("closed-tier-summary")).not.toBeInTheDocument();
  });
});

describe("ClosedDrawerBody — refund mode", () => {
  it("leads with the refund total via the admin-tracked refunded_amount_cents column (C14)", () => {
    const group = makeGroup({
      commitments: [
        makeCommit({
          status: "cancelled",
          refunded_amount_cents: 30000,
          refunded_at: "2026-04-22T12:00:00Z",
        }),
      ],
    });
    render(
      <ClosedDrawerBody
        group={group}
        mode="refund"
        tiers={[{ min_quantity_kg: 500, price_per_kg: 10 }]}
      />
    );
    const header = screen.getByTestId("closed-refund-header");
    expect(header.textContent).toContain("$300.00");
    expect(header.textContent).toContain("refunded");

    // Savings, tier summary, and Commit more must all be absent
    expect(screen.queryByTestId("closed-savings")).not.toBeInTheDocument();
    expect(screen.queryByTestId("closed-tier-summary")).not.toBeInTheDocument();
    expect(screen.queryByText(/Commit more/i)).not.toBeInTheDocument();
  });

  it("uses total_price as the refund when the cron has flipped a charged commitment to cancelled", () => {
    // The settle-deadlines cron issues a Stripe refund and updates the
    // commitment to status=cancelled / payment_status=cancelled, but does
    // NOT touch refunded_amount_cents. The drawer should fall back to
    // total_price as the refund amount in that case (the buyer got back
    // exactly what they were originally going to be charged).
    const group = makeGroup({
      commitments: [
        makeCommit({
          id: "c-cron-1",
          status: "cancelled",
          payment_status: "cancelled",
          stripe_payment_intent_id: "pi_charged_then_refunded",
          total_price: 132,
          charge_amount_cents: 13200,
          refunded_amount_cents: 0, // never touched by cron
          refunded_at: null,
          payment_error: "Refunded: lot minimum not met by deadline",
        }),
        makeCommit({
          id: "c-cron-2",
          status: "cancelled",
          payment_status: "cancelled",
          stripe_payment_intent_id: "pi_charged_then_refunded_2",
          total_price: 264,
          charge_amount_cents: 26400,
          refunded_amount_cents: 0,
          refunded_at: null,
          payment_error: "Refunded: lot minimum not met by deadline",
        }),
      ],
    });
    render(<ClosedDrawerBody group={group} mode="refund" />);
    const header = screen.getByTestId("closed-refund-header");
    // 132 + 264 = 396
    expect(header.textContent).toContain("$396.00");
  });

  it("shows $0 when the campaign failed before any commitment was charged", () => {
    // Setup-Intent-only commitments that got cancelled before settlement
    // ever processed a charge — no money moved, so no refund.
    const group = makeGroup({
      commitments: [
        makeCommit({
          status: "cancelled",
          payment_status: "cancelled",
          stripe_payment_intent_id: null,
          total_price: 132,
          charge_amount_cents: null,
          refunded_amount_cents: 0,
        }),
      ],
    });
    render(<ClosedDrawerBody group={group} mode="refund" />);
    const header = screen.getByTestId("closed-refund-header");
    expect(header.textContent).toContain("$0.00");
  });
});

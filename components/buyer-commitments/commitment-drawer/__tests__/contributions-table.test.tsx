// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("@/components/unit-provider", () => ({
  useUnitPreference: () => ({ unit: "kg", setUnit: () => {} }),
}));

import type { Commitment } from "@/lib/types";
import { ContributionsTable } from "@/components/buyer-commitments/commitment-drawer/contributions-table";

function makeCommitment(overrides: Partial<Commitment> = {}): Commitment {
  return {
    id: "c-default",
    lot_id: "lot-1",
    buyer_id: "buyer-1",
    hub_id: null,
    campaign_id: "camp-1",
    quantity_kg: 10,
    price_per_kg: 12,
    total_price: 132,
    status: "confirmed",
    payment_status: "charge_succeeded",
    charge_amount_cents: 13200,
    charge_currency: "usd",
    stripe_checkout_session_id: null,
    stripe_setup_intent_id: null,
    stripe_payment_method_id: null,
    stripe_customer_id: null,
    stripe_payment_intent_id: "pi_x",
    stripe_charge_id: null,
    payment_error: null,
    charged_at: "2026-04-15T00:00:00Z",
    notes: null,
    picked_up_at: null,
    picked_up_by: null,
    kg_locked_at_settlement: null,
    kg_refunded_at_settlement: null,
    refund_status: "not_refunded",
    refunded_amount_cents: 0,
    refunded_at: null,
    refunded_by: null,
    last_refund_id: null,
    refund_reason: null,
    created_at: "2026-04-15T00:00:00Z",
    updated_at: "2026-04-15T00:00:00Z",
    ...overrides,
  };
}

describe("ContributionsTable", () => {
  it("renders one row per non-charge_failed commitment", () => {
    const commitments: Commitment[] = [
      makeCommitment({ id: "c-1" }),
      makeCommitment({ id: "c-2" }),
      makeCommitment({ id: "c-3" }),
      makeCommitment({ id: "c-4-failed", payment_status: "charge_failed" }),
    ];
    render(<ContributionsTable commitments={commitments} />);
    expect(screen.getByTestId("commitment-row-c-1")).toBeInTheDocument();
    expect(screen.getByTestId("commitment-row-c-2")).toBeInTheDocument();
    expect(screen.getByTestId("commitment-row-c-3")).toBeInTheDocument();
    expect(screen.queryByTestId("commitment-row-c-4-failed")).not.toBeInTheDocument();
  });

  it("renders a refund line beneath a refunded commitment with the cumulative amount and date", () => {
    const commitments: Commitment[] = [
      makeCommitment({
        id: "c-with-refund",
        refunded_amount_cents: 5500,
        refunded_at: "2026-04-28T12:00:00Z",
      }),
    ];
    render(<ContributionsTable commitments={commitments} />);
    const refundRow = screen.getByTestId("commitment-refund-c-with-refund");
    expect(refundRow).toBeInTheDocument();
    expect(refundRow.textContent).toContain("$55.00");
    expect(refundRow.textContent).toContain("Apr 28, 2026");
  });

  it("does not render a refund line when refunded_amount_cents is 0", () => {
    const commitments: Commitment[] = [makeCommitment({ id: "c-none" })];
    render(<ContributionsTable commitments={commitments} />);
    expect(screen.queryByTestId("commitment-refund-c-none")).not.toBeInTheDocument();
  });

  it("falls back to total_price when charge_amount_cents is null", () => {
    const commitments: Commitment[] = [
      makeCommitment({
        id: "c-fallback",
        charge_amount_cents: null,
        total_price: 99,
      }),
    ];
    render(<ContributionsTable commitments={commitments} />);
    const row = screen.getByTestId("commitment-row-c-fallback");
    expect(row.textContent).toContain("$99.00");
  });

  it("renders an empty-state message when only charge_failed commitments are passed", () => {
    const commitments: Commitment[] = [
      makeCommitment({ id: "c-fail-1", payment_status: "charge_failed" }),
      makeCommitment({ id: "c-fail-2", payment_status: "charge_failed" }),
    ];
    render(<ContributionsTable commitments={commitments} />);
    expect(screen.getByText(/No contributions/i)).toBeInTheDocument();
  });
});

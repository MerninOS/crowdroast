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
    settlement_email_sent_at: null,
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

  it("shows $0 when no money has actually moved (charge_amount_cents null + no bag rows)", () => {
    // Pre-fix this fell back to total_price (the buyer's pre-settle PLEDGE)
    // even though the card was never charged — overstated what the buyer
    // had paid. Now reflects actual money moved on Stripe via
    // effectiveChargedCents, which returns 0 in this anomalous state.
    const commitments: Commitment[] = [
      makeCommitment({
        id: "c-no-cents",
        charge_amount_cents: null,
        total_price: 99,
        payment_status: "setup_complete",
      }),
    ];
    render(<ContributionsTable commitments={commitments} />);
    const row = screen.getByTestId("commitment-row-c-no-cents");
    expect(row.textContent).toContain("$0.00");
  });

  it("shows $0 for cancelled commits (never charged the card)", () => {
    const commitments: Commitment[] = [
      makeCommitment({
        id: "c-cancelled",
        status: "cancelled",
        payment_status: "cancelled",
        charge_amount_cents: null,
        total_price: 132,
      }),
    ];
    render(<ContributionsTable commitments={commitments} />);
    const row = screen.getByTestId("commitment-row-c-cancelled");
    expect(row.textContent).toContain("$0.00");
  });

  // -------------------------------------------------------------------------
  // Bag-aware partial-fill scenarios (the user-reported bug)
  // -------------------------------------------------------------------------
  // A buyer pledged 72 kg against a 63-kg bag; settlement locked 1 bag
  // (63 kg) and dropped the leftover 9 kg. The table should now show:
  //   parent row: 63 kg @ $880  (Paid)
  //   dropped row: 9 kg @ $0    (Not charged)
  // so the math reads cleanly. Pre-fix, the parent row showed 63 kg but
  // the buyer's pledged total_price as the dollar amount — that math
  // didn't add up.

  it("renders a separate 'Not charged' sub-row for the kg that didn't fill a bag", () => {
    const commitments: Commitment[] = [
      makeCommitment({
        id: "c-partial",
        payment_status: "setup_complete",
        charge_amount_cents: null,
        quantity_kg: 72,
        kg_locked_at_settlement: 63,
        total_price: 832,
      }),
    ];
    const bagChargesByCommitmentId = {
      "c-partial": [
        {
          id: "bc-1",
          commitment_id: "c-partial",
          bag_number: 1,
          kg: 63,
          amount_cents: 88000, // $880
          payment_status: "charged" as const,
          updated_at: "2026-04-20T00:00:00Z",
        },
      ],
    };
    render(
      <ContributionsTable
        commitments={commitments}
        bagChargesByCommitmentId={bagChargesByCommitmentId}
      />
    );
    // Parent row reflects the actually-charged amount ($880), not the
    // buyer's pre-settle pledge ($832 for 72 kg).
    const parent = screen.getByTestId("commitment-row-c-partial");
    expect(parent.textContent).toContain("$880.00");

    // Dropped sub-row exists with the leftover kg and $0.
    const dropped = screen.getByTestId("commitment-dropped-c-partial");
    expect(dropped).toBeInTheDocument();
    expect(dropped.textContent).toContain("9");
    expect(dropped.textContent).toContain("$0.00");
    expect(dropped.textContent).toMatch(/Not charged/i);
  });

  it("does NOT render a dropped sub-row when the commit filled cleanly", () => {
    // 60 kg pledged, 60 kg locked = clean fill; no leftover.
    const commitments: Commitment[] = [
      makeCommitment({
        id: "c-clean",
        payment_status: "setup_complete",
        charge_amount_cents: null,
        quantity_kg: 60,
        kg_locked_at_settlement: 60,
      }),
    ];
    const bagChargesByCommitmentId = {
      "c-clean": [
        {
          id: "bc-1",
          commitment_id: "c-clean",
          bag_number: 1,
          kg: 60,
          amount_cents: 60000,
          payment_status: "charged" as const,
          updated_at: "2026-04-20T00:00:00Z",
        },
      ],
    };
    render(
      <ContributionsTable
        commitments={commitments}
        bagChargesByCommitmentId={bagChargesByCommitmentId}
      />
    );
    expect(screen.queryByTestId("commitment-dropped-c-clean")).not.toBeInTheDocument();
  });

  it("does NOT render a dropped sub-row pre-settle (kg_locked_at_settlement still null)", () => {
    // The buyer is still on the active campaign — settlement hasn't run, so
    // nothing has been "dropped" yet. Showing a dropped row here would be
    // confusing.
    const commitments: Commitment[] = [
      makeCommitment({
        id: "c-raising",
        payment_status: "setup_complete",
        charge_amount_cents: null,
        quantity_kg: 72,
        kg_locked_at_settlement: null,
      }),
    ];
    render(<ContributionsTable commitments={commitments} />);
    expect(screen.queryByTestId("commitment-dropped-c-raising")).not.toBeInTheDocument();
  });

  it("sums multiple charged bag rows for the parent total (multi-bag commit)", () => {
    const commitments: Commitment[] = [
      makeCommitment({
        id: "c-multibag",
        payment_status: "setup_complete",
        charge_amount_cents: null,
        quantity_kg: 120,
        kg_locked_at_settlement: 120,
      }),
    ];
    const bagChargesByCommitmentId = {
      "c-multibag": [
        { id: "bc-1", commitment_id: "c-multibag", bag_number: 1, kg: 60, amount_cents: 60000, payment_status: "charged" as const, updated_at: "2026-04-20T00:00:00Z" },
        { id: "bc-2", commitment_id: "c-multibag", bag_number: 2, kg: 60, amount_cents: 60000, payment_status: "charged" as const, updated_at: "2026-04-20T00:00:00Z" },
      ],
    };
    render(
      <ContributionsTable
        commitments={commitments}
        bagChargesByCommitmentId={bagChargesByCommitmentId}
      />
    );
    const row = screen.getByTestId("commitment-row-c-multibag");
    // $600 + $600 = $1,200 — sums charged bag amount_cents, not commitment.total_price.
    expect(row.textContent).toContain("$1,200.00");
  });

  it("only credits CHARGED bag rows in the parent total — failed bags don't inflate it", () => {
    // 2 bags total: 1 charged ($600), 1 payment_failed. Parent total should
    // be $600 ONLY. The user's bug was that the total reflected the
    // buyer's pre-settle pledge even when some bags failed.
    const commitments: Commitment[] = [
      makeCommitment({
        id: "c-partial-fail",
        payment_status: "setup_complete",
        charge_amount_cents: null,
        quantity_kg: 120,
        kg_locked_at_settlement: 120,
      }),
    ];
    const bagChargesByCommitmentId = {
      "c-partial-fail": [
        { id: "bc-1", commitment_id: "c-partial-fail", bag_number: 1, kg: 60, amount_cents: 60000, payment_status: "charged" as const, updated_at: "2026-04-20T00:00:00Z" },
        { id: "bc-2", commitment_id: "c-partial-fail", bag_number: 2, kg: 60, amount_cents: 60000, payment_status: "payment_failed" as const, updated_at: "2026-04-20T00:00:00Z" },
      ],
    };
    render(
      <ContributionsTable
        commitments={commitments}
        bagChargesByCommitmentId={bagChargesByCommitmentId}
      />
    );
    const row = screen.getByTestId("commitment-row-c-partial-fail");
    expect(row.textContent).toContain("$600.00");
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

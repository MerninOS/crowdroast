// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("@/components/unit-provider", () => ({
  useUnitPreference: () => ({ unit: "kg", setUnit: () => {} }),
}));

import type { Commitment } from "@/lib/types";
import {
  BagBreakdown,
  type BagChargeRow,
} from "@/components/buyer-commitments/commitment-drawer/bag-breakdown";

function makeCommit(over: Partial<Commitment> = {}): Commitment {
  return {
    id: "c-1",
    lot_id: "lot-1",
    buyer_id: "b-1",
    hub_id: null,
    campaign_id: "camp-1",
    quantity_kg: 100,
    price_per_kg: 9,
    total_price: 990,
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
    updated_at: "2026-04-25T12:00:00Z",
    ...over,
  };
}

function makeRow(over: Partial<BagChargeRow>): BagChargeRow {
  return {
    id: `bc-${over.bag_number ?? 1}`,
    commitment_id: "c-1",
    bag_number: 1,
    kg: 60,
    amount_cents: 59400, // 60 kg × $9.90
    payment_status: "charged",
    ...over,
  };
}

describe("BagBreakdown — mixed-state commit", () => {
  // Three completed bags in different states for one 100kg commit:
  //   Bag 1: 60 kg → charged
  //   Bag 2: 30 kg → awaiting_charge
  //   Bag 3:  5 kg → payment_failed
  // Sum of bag-charge kg = 95 → 5 kg dropped (incomplete bag, never charged)
  const commit = makeCommit({ id: "c-1", quantity_kg: 100 });
  const rows: BagChargeRow[] = [
    makeRow({ bag_number: 1, kg: 60, amount_cents: 59400, payment_status: "charged" }),
    makeRow({
      bag_number: 2,
      kg: 30,
      amount_cents: 29700,
      payment_status: "awaiting_charge",
    }),
    makeRow({
      bag_number: 3,
      kg: 5,
      amount_cents: 4950,
      payment_status: "payment_failed",
    }),
  ];

  it("renders one row per bag-charge sorted by bag_number ASC", () => {
    render(
      <BagBreakdown
        commitments={[commit]}
        bagChargesByCommitmentId={{ "c-1": rows }}
      />
    );
    const r1 = screen.getByTestId("bag-row-1");
    const r2 = screen.getByTestId("bag-row-2");
    const r3 = screen.getByTestId("bag-row-3");
    expect(r1).toBeInTheDocument();
    expect(r2).toBeInTheDocument();
    expect(r3).toBeInTheDocument();
    // DOM order = bag_number order
    expect(r1.compareDocumentPosition(r2)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(r2.compareDocumentPosition(r3)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );

    // Per-row contents — bag number, kg with unit, money formatted, status pill.
    expect(r1.textContent).toContain("#1");
    expect(r1.textContent).toContain("60 kg");
    expect(r1.textContent).toContain("$594.00");
    expect(screen.getByTestId("bag-status-1").textContent).toMatch(/Charged/);
    expect(screen.getByTestId("bag-status-2").textContent).toMatch(/Awaiting/);
    expect(screen.getByTestId("bag-status-3").textContent).toMatch(/Failed/);
  });

  it("computes the correct kg aggregates and surfaces all four boxes", () => {
    render(
      <BagBreakdown
        commitments={[commit]}
        bagChargesByCommitmentId={{ "c-1": rows }}
      />
    );

    // Purchased = 60 (charged bag only).
    expect(screen.getByTestId("agg-purchased").textContent).toContain("60 kg");
    // Awaiting = 30 (awaiting_charge).
    expect(screen.getByTestId("agg-awaiting").textContent).toContain("30 kg");
    // Failed = 5 (payment_failed → not shipping).
    expect(screen.getByTestId("agg-failed").textContent).toContain("5 kg");
    // Dropped = 100 committed − 95 in any bag = 5 (incomplete bag, never charged).
    expect(screen.getByTestId("agg-dropped").textContent).toContain("5 kg");
  });

  it("groups retry_scheduled and charging into the awaiting bucket", () => {
    // Three rows, all flavors of "money is coming but not yet locked in":
    //   awaiting_charge   10 kg
    //   charging          20 kg
    //   retry_scheduled    5 kg
    // → awaiting total = 35 kg. No purchased / failed / dropped (committed=35).
    const altCommit = makeCommit({ id: "c-1", quantity_kg: 35 });
    render(
      <BagBreakdown
        commitments={[altCommit]}
        bagChargesByCommitmentId={{
          "c-1": [
            makeRow({
              bag_number: 1,
              kg: 10,
              amount_cents: 9900,
              payment_status: "awaiting_charge",
            }),
            makeRow({
              bag_number: 2,
              kg: 20,
              amount_cents: 19800,
              payment_status: "charging",
            }),
            makeRow({
              bag_number: 3,
              kg: 5,
              amount_cents: 4950,
              payment_status: "retry_scheduled",
            }),
          ],
        }}
      />
    );
    expect(screen.getByTestId("agg-awaiting").textContent).toContain("35 kg");
    // Zero-valued aggregates are suppressed.
    expect(screen.queryByTestId("agg-failed")).not.toBeInTheDocument();
    expect(screen.queryByTestId("agg-dropped")).not.toBeInTheDocument();
    // Purchased still rendered but at 0 — it's the always-on box.
    expect(screen.getByTestId("agg-purchased").textContent).toContain("0 kg");
  });

  it("excludes cancelled commitments from kg-dropped math and rows", () => {
    // c-1 has a 60kg charged bag. A sibling cancelled commit c-2 shouldn't
    // bump the committedKg baseline (otherwise we'd inflate "Returned" kg).
    const cancelled = makeCommit({
      id: "c-2",
      quantity_kg: 100,
      status: "cancelled",
      payment_status: "cancelled",
    });
    render(
      <BagBreakdown
        commitments={[commit, cancelled]}
        bagChargesByCommitmentId={{
          "c-1": [
            makeRow({
              bag_number: 1,
              kg: 60,
              amount_cents: 59400,
              payment_status: "charged",
            }),
          ],
        }}
      />
    );
    expect(screen.getByTestId("agg-purchased").textContent).toContain("60 kg");
    // 100 − 60 = 40 returned (c-2 is cancelled → ignored)
    expect(screen.getByTestId("agg-dropped").textContent).toContain("40 kg");
  });
});

describe("BagBreakdown — empty state", () => {
  it("renders the 'All kg returned' card when no bag-charge rows exist", () => {
    // Campaign that failed minimum, or a legacy lot — no rows ever created.
    const commit = makeCommit({ id: "c-1", quantity_kg: 30 });
    render(
      <BagBreakdown
        commitments={[commit]}
        bagChargesByCommitmentId={{}}
      />
    );
    const empty = screen.getByTestId("bag-breakdown-empty");
    expect(empty).toBeInTheDocument();
    expect(empty.textContent).toContain("All kg returned");
    expect(empty.textContent).toMatch(/No completed bags/i);

    // No table, no per-row aggregates strip
    expect(screen.queryByTestId("bag-breakdown-aggregates")).not.toBeInTheDocument();
    expect(screen.queryByTestId("bag-row-1")).not.toBeInTheDocument();
  });

  it("renders the empty state when only an empty array is mapped", () => {
    // Defensive: an empty array entry should behave the same as no entry.
    const commit = makeCommit({ id: "c-1", quantity_kg: 30 });
    render(
      <BagBreakdown
        commitments={[commit]}
        bagChargesByCommitmentId={{ "c-1": [] }}
      />
    );
    expect(screen.getByTestId("bag-breakdown-empty")).toBeInTheDocument();
  });
});

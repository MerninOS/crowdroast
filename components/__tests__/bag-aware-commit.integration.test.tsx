// @vitest-environment jsdom

/**
 * Integration test — Task 2.10 of the bag-aware-campaign-close plan.
 *
 * This repo has no `e2e/` directory and no browser-driven test harness
 * (Playwright/Cypress); the project's `test` script is `vitest run`. So
 * "e2e" here means a high-level integration test: mount the real
 * `CommitmentForm` alongside the real `CommitSplitWarning` (no mocking of
 * the warning — that's the whole point of this test) and drive the
 * rendered DOM the way a buyer would.
 *
 * Scenario:
 *   - lot bag_size_kg = 60
 *   - 100 kg of prior commits already on the lot (from other buyers)
 *   - Buyer types a 30 kg pledge into the form
 *
 * Math:
 *   - 100 % 60 = 40 (bag 1 full at 60, bag 2 sitting at 40/60)
 *   - bag_remaining = 60 - 40 = 20 kg
 *   - A 30 kg pledge crosses the bag-2 boundary (30 > 20)
 *     → CommitSplitWarning renders:
 *         locks row    = 20 kg (completes the current bag)
 *         at-risk row  = 10 kg (starts a new bag)
 *   - If the buyer drops the input to 15 kg (< 20), the warning disappears.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

// Side-effect-only mocks: keep the real CommitmentForm + CommitSplitWarning,
// just stub the transports that would otherwise need a router/toast runtime.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Default unit = kg so input value is interpreted 1:1 as kg.
vi.mock("@/components/unit-provider", () => ({
  useUnitPreference: () => ({ unit: "kg", setUnit: () => {} }),
}));

import { CommitmentForm } from "@/components/commitment-form";

const renderForm = () =>
  render(
    <CommitmentForm
      lotId="lot-1"
      activePrice={10}
      maxKg={500}
      hubId="hub-1"
      bagSizeKg={60}
      totalCommittedKg={100}
    />
  );

describe("CommitmentForm × CommitSplitWarning integration (Task 2.10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the split warning with locks=20kg / at-risk=10kg when buyer pledges 30kg into bag with 20kg remaining", () => {
    renderForm();

    // Drive the form: type 30 into the kg input.
    const qty = screen.getByLabelText(/quantity/i) as HTMLInputElement;
    fireEvent.change(qty, { target: { value: "30" } });

    // Warning panel mounts (role=alert is set by CommitSplitWarning).
    expect(screen.getByRole("alert")).toBeInTheDocument();

    // Locks row: 20 kg completes the current bag.
    const locksRow = screen.getByTestId("commit-split-warning-locks-row");
    expect(locksRow.textContent).toMatch(/20/);
    expect(locksRow.textContent).toMatch(/completes the current bag/i);

    // At-risk row: 30 - 20 = 10 kg starts a new bag.
    const atRiskRow = screen.getByTestId("commit-split-warning-atrisk-row");
    expect(atRiskRow.textContent).toMatch(/10/);
    expect(atRiskRow.textContent).toMatch(/starts a new bag/i);
    // And the new-bag target size (60 kg) is surfaced in the same row.
    expect(atRiskRow.textContent).toMatch(/60/);
  });

  it("hides the warning when the buyer drops the pledge to 15kg (fits inside the current bag)", () => {
    renderForm();

    const qty = screen.getByLabelText(/quantity/i) as HTMLInputElement;

    // First push it over the boundary so we know the warning *can* render.
    fireEvent.change(qty, { target: { value: "30" } });
    expect(screen.getByRole("alert")).toBeInTheDocument();

    // Now drop it under the 20kg bag-remaining — warning must disappear.
    fireEvent.change(qty, { target: { value: "15" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByTestId("commit-split-warning-locks-row")).toBeNull();
    expect(screen.queryByTestId("commit-split-warning-atrisk-row")).toBeNull();
  });

  it("toggles correctly across the boundary: 15kg hidden → 30kg visible → 15kg hidden again", () => {
    renderForm();

    const qty = screen.getByLabelText(/quantity/i) as HTMLInputElement;

    // Initial default is "1" → fits in bag-remaining → no warning.
    expect(screen.queryByRole("alert")).toBeNull();

    // 15kg < 20kg remaining → still no warning.
    fireEvent.change(qty, { target: { value: "15" } });
    expect(screen.queryByRole("alert")).toBeNull();

    // 30kg > 20kg remaining → warning appears with the right split.
    fireEvent.change(qty, { target: { value: "30" } });
    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(
      screen.getByTestId("commit-split-warning-locks-row").textContent
    ).toMatch(/20/);
    expect(
      screen.getByTestId("commit-split-warning-atrisk-row").textContent
    ).toMatch(/10/);

    // Back under the boundary → warning gone again.
    fireEvent.change(qty, { target: { value: "15" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

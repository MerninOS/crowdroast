// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// Controllable unit mock — flip `currentUnit` before render() to switch lb/kg.
let currentUnit: "kg" | "lb" = "kg";
vi.mock("@/components/unit-provider", () => ({
  useUnitPreference: () => ({ unit: currentUnit, setUnit: () => {} }),
}));

import { CommitSplitWarning } from "@/components/campaign/commit-split-warning";

describe("CommitSplitWarning", () => {
  it("renders nothing when pending_kg <= bag_remaining_kg (no boundary cross)", () => {
    currentUnit = "kg";
    const { container } = render(
      <CommitSplitWarning
        pending_kg={10}
        bag_remaining_kg={20}
        bag_size_kg={60}
      />
    );

    // Component returns null in this case.
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders the warning panel when pending_kg > bag_remaining_kg", () => {
    currentUnit = "kg";
    render(
      <CommitSplitWarning
        pending_kg={50}
        bag_remaining_kg={18}
        bag_size_kg={60}
      />
    );

    // Panel has role=alert and a recognizable headline.
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/spans a bag boundary/i)).toBeTruthy();
  });

  it("shows the correct split values: locks = remaining, at-risk = pending − remaining", () => {
    currentUnit = "kg";
    render(
      <CommitSplitWarning
        pending_kg={50}
        bag_remaining_kg={18}
        bag_size_kg={60}
      />
    );

    const locksRow = screen.getByTestId("commit-split-warning-locks-row");
    const atRiskRow = screen.getByTestId("commit-split-warning-atrisk-row");

    // Locks row shows the bag_remaining_kg value (18).
    expect(locksRow.textContent).toMatch(/18\s*kg/);
    expect(locksRow.textContent).toMatch(/completes the current bag/i);

    // At-risk row shows pending - remaining = 32, and references bag size (60).
    expect(atRiskRow.textContent).toMatch(/32\s*kg/);
    expect(atRiskRow.textContent).toMatch(/starts a new bag/i);
    expect(atRiskRow.textContent).toMatch(/60\s*kg/);
  });

  it("omits the Locks row when bag_remaining_kg is 0 (entire pledge starts a fresh bag)", () => {
    currentUnit = "kg";
    render(
      <CommitSplitWarning
        pending_kg={20}
        bag_remaining_kg={0}
        bag_size_kg={60}
      />
    );

    // The at-risk row still renders.
    expect(screen.getByTestId("commit-split-warning-atrisk-row")).toBeTruthy();
    // The locks row is omitted.
    expect(screen.queryByTestId("commit-split-warning-locks-row")).toBeNull();
    // And the "completes the current bag" copy is absent.
    expect(screen.queryByText(/completes the current bag/i)).toBeNull();
  });

  it("formats kg values in lb when the unit preference is lb", () => {
    currentUnit = "lb";
    render(
      <CommitSplitWarning
        pending_kg={50}
        bag_remaining_kg={18}
        bag_size_kg={60}
      />
    );

    // 18 kg → 39.7 lb (locks row)
    expect(screen.getByTestId("commit-split-warning-locks-row").textContent).toMatch(
      /39\.7\s*lb/
    );
    // 32 kg → 70.5 lb (at-risk row), and bag size 60 kg → 132.3 lb
    const atRiskText =
      screen.getByTestId("commit-split-warning-atrisk-row").textContent ?? "";
    expect(atRiskText).toMatch(/70\.5\s*lb/);
    expect(atRiskText).toMatch(/132\.3\s*lb/);
  });
});

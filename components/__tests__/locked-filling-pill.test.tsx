// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// Controllable unit mock — flip `currentUnit` before render() to switch lb/kg.
// Matches the simple `vi.mock` pattern used by other component tests, but
// avoids the "one unit per file" limitation so we can test both kg and lb.
let currentUnit: "kg" | "lb" = "kg";
vi.mock("@/components/unit-provider", () => ({
  useUnitPreference: () => ({ unit: currentUnit, setUnit: () => {} }),
}));

import { LockedFillingPill } from "@/components/campaign/locked-filling-pill";

describe("LockedFillingPill", () => {
  it("renders only the Locked pill when locked_kg > 0 and filling_kg = 0", () => {
    currentUnit = "kg";
    render(<LockedFillingPill locked_kg={60} filling_kg={0} />);

    // Locked content appears
    expect(screen.getByText(/Locked/i)).toBeTruthy();
    // The kg value renders on the locked pill (formatted as "60")
    expect(screen.getByText(/60\s*kg/i)).toBeTruthy();
    // No Filling pill
    expect(screen.queryByText(/Filling/i)).toBeNull();
  });

  it("renders only the Filling pill when locked_kg = 0 and filling_kg > 0", () => {
    currentUnit = "kg";
    render(<LockedFillingPill locked_kg={0} filling_kg={18} />);

    expect(screen.getByText(/Filling/i)).toBeTruthy();
    expect(screen.getByText(/18\s*kg/i)).toBeTruthy();
    expect(screen.queryByText(/Locked/i)).toBeNull();
  });

  it("renders both pills when the pledge is split across a bag boundary", () => {
    currentUnit = "kg";
    render(<LockedFillingPill locked_kg={40} filling_kg={20} />);

    // Both labels present
    expect(screen.getByText(/Locked/i)).toBeTruthy();
    expect(screen.getByText(/Filling/i)).toBeTruthy();
    // Both kg values present
    expect(screen.getByText(/40\s*kg/i)).toBeTruthy();
    expect(screen.getByText(/20\s*kg/i)).toBeTruthy();
  });

  it("appends the bag-remaining suffix on the Filling pill when provided, omits it when null", () => {
    currentUnit = "kg";

    // With remaining context
    const { unmount } = render(
      <LockedFillingPill
        locked_kg={0}
        filling_kg={18}
        bag_remaining_kg={42}
      />
    );
    expect(screen.getByText(/42\s*kg\s*from\s*completion/i)).toBeTruthy();
    unmount();

    // Without remaining context (null)
    render(
      <LockedFillingPill
        locked_kg={0}
        filling_kg={18}
        bag_remaining_kg={null}
      />
    );
    expect(screen.queryByText(/from\s*completion/i)).toBeNull();
  });

  it("formats kg values in lb when the unit preference is lb", () => {
    currentUnit = "lb";
    render(
      <LockedFillingPill
        locked_kg={60}
        filling_kg={0}
      />
    );

    // 60 kg → ~132.3 lb. Assert lb label appears and the kg label does not on the value span.
    expect(screen.getByText(/132\.3\s*lb/i)).toBeTruthy();
    // The Locked label still renders
    expect(screen.getByText(/Locked/i)).toBeTruthy();
  });
});

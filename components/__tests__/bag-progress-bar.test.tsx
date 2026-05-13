// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// Controllable unit mock — flip `currentUnit` before render() to switch lb/kg.
let currentUnit: "kg" | "lb" = "kg";
vi.mock("@/components/unit-provider", () => ({
  useUnitPreference: () => ({ unit: currentUnit, setUnit: () => {} }),
}));

import { BagProgressBar } from "@/components/campaign/bag-progress-bar";

describe("BagProgressBar", () => {
  it("renders the completed bag count headline (187 kg / 60 kg → 3 bags)", () => {
    currentUnit = "kg";
    render(<BagProgressBar total_pledged_kg={187} bag_size_kg={60} />);

    // The big headline number is "3" with a "bags locked" label nearby
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText(/bags\s*locked/i)).toBeTruthy();
  });

  it("renders the in-progress bag fill (Bag 4 at 11%) when there is a partial bag", () => {
    currentUnit = "kg";
    render(<BagProgressBar total_pledged_kg={187} bag_size_kg={60} />);

    // 7 / 60 = 11.66... → rounded to 12 by Math.round.
    // Use a regex that covers the actual rounded value the component renders.
    expect(screen.getByText(/Bag\s*4/i)).toBeTruthy();
    // Confirm a percentage is shown — assert against the actual rounded value (12%)
    expect(screen.getByText(/12%/)).toBeTruthy();
    // ARIA progressbar with the right label
    expect(screen.getByRole("progressbar", { name: /Bag 4 filling/i })).toBeTruthy();
  });

  it("does not render the in-progress fill line when total is an exact bag multiple", () => {
    currentUnit = "kg";
    render(<BagProgressBar total_pledged_kg={180} bag_size_kg={60} />);

    // "3" completed should appear in the headline
    expect(screen.getByText("3")).toBeTruthy();
    // No in-progress filling row should render — no "Bag 4" label, no progressbar.
    expect(screen.queryByText(/Bag\s*4/i)).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("renders the empty-state copy when nothing has been pledged yet", () => {
    currentUnit = "kg";
    render(<BagProgressBar total_pledged_kg={0} bag_size_kg={60} />);

    // Empty-state headline copy from the component
    expect(screen.getByText(/First bag.*waiting/i)).toBeTruthy();
    // No progressbar in the empty state
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("shows the 'Need N more bag(s)' callout with correct pluralization", () => {
    currentUnit = "kg";

    // Singular: 2 completed, min 3 → "Need 1 more bag"
    const { unmount } = render(
      <BagProgressBar
        total_pledged_kg={120}
        bag_size_kg={60}
        min_bags_to_succeed={3}
      />
    );
    expect(screen.getByText(/Need\s*1\s*more\s*bag\s*to\s*settle/i)).toBeTruthy();
    unmount();

    // Plural: 2 completed, min 4 → "Need 2 more bags"
    render(
      <BagProgressBar
        total_pledged_kg={120}
        bag_size_kg={60}
        min_bags_to_succeed={4}
      />
    );
    expect(screen.getByText(/Need\s*2\s*more\s*bags\s*to\s*settle/i)).toBeTruthy();
  });

  it("renders bag size in lb when the unit preference is lb", () => {
    currentUnit = "lb";
    render(<BagProgressBar total_pledged_kg={120} bag_size_kg={60} />);

    // 60 kg → ~132.3 lb. The bag-size pill reads "<formatted> lb / bag".
    expect(screen.getByText(/132\.3\s*lb\s*\/\s*bag/i)).toBeTruthy();
  });
});

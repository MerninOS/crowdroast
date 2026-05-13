// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// Controllable unit mock — flip `currentUnit` before render() to switch lb/kg.
let currentUnit: "kg" | "lb" = "kg";
vi.mock("@/components/unit-provider", () => ({
  useUnitPreference: () => ({ unit: currentUnit, setUnit: () => {} }),
}));

import { SellerCampaignPreview } from "@/components/seller-campaign-preview";

describe("SellerCampaignPreview", () => {
  describe("active state (187 kg pledged, 60 kg bags)", () => {
    it("renders the total pledged kg value", () => {
      currentUnit = "kg";
      render(
        <SellerCampaignPreview
          total_pledged_kg={187}
          bag_size_kg={60}
          min_bags_to_succeed={1}
        />
      );

      // 187 kg formatted with maxFractionDigits=1 → "187"
      expect(screen.getByText("187")).toBeTruthy();
      // The "Pledged so far" label is present
      expect(screen.getByText(/Pledged so far/i)).toBeTruthy();
    });

    it("renders the completed bag count (3 bags)", () => {
      currentUnit = "kg";
      render(
        <SellerCampaignPreview
          total_pledged_kg={187}
          bag_size_kg={60}
          min_bags_to_succeed={1}
        />
      );

      // "Completed bags" label
      expect(screen.getByText(/Completed bags/i)).toBeTruthy();
      // The number 3 appears for completed bag count
      // (also appears in the "Will settle: 3 bags" line — getAllByText handles either)
      expect(screen.getAllByText("3").length).toBeGreaterThan(0);
    });

    it("renders the in-progress bag fill percentage (Bag 4 at 12%)", () => {
      currentUnit = "kg";
      render(
        <SellerCampaignPreview
          total_pledged_kg={187}
          bag_size_kg={60}
          min_bags_to_succeed={1}
        />
      );

      // 7 / 60 = 11.66... → rounded by Math.round → 12%.
      expect(screen.getByText(/Bag\s*4/i)).toBeTruthy();
      expect(screen.getByText(/12%/)).toBeTruthy();
    });

    it("renders the projected final bag count via the 'Will settle' line", () => {
      currentUnit = "kg";
      render(
        <SellerCampaignPreview
          total_pledged_kg={187}
          bag_size_kg={60}
          min_bags_to_succeed={1}
        />
      );

      // The "If campaign closed now" projection line
      expect(screen.getByText(/If campaign closed now/i)).toBeTruthy();
      expect(screen.getByText(/Will settle/i)).toBeTruthy();
    });
  });

  describe("status indicator", () => {
    it("shows the on-track status when completed_bags >= min_bags_to_succeed", () => {
      currentUnit = "kg";
      render(
        <SellerCampaignPreview
          total_pledged_kg={187}
          bag_size_kg={60}
          min_bags_to_succeed={1}
        />
      );

      // 3 completed >= 1 minimum → on track
      expect(screen.getByText(/On track to settle/i)).toBeTruthy();
      // Status role with polite live-region
      expect(screen.getByRole("status")).toBeTruthy();
    });

    it("shows 'Needs 2 more bags' (plural) when 3 completed but 5 needed", () => {
      currentUnit = "kg";
      render(
        <SellerCampaignPreview
          total_pledged_kg={187}
          bag_size_kg={60}
          min_bags_to_succeed={5}
        />
      );

      // 5 - 3 = 2 short → plural "bags"
      expect(screen.getByText(/Needs\s*2\s*more\s*bags\s*to\s*settle/i)).toBeTruthy();
    });

    it("shows 'Needs 1 more bag' (singular) when 3 completed but 4 needed", () => {
      currentUnit = "kg";
      render(
        <SellerCampaignPreview
          total_pledged_kg={187}
          bag_size_kg={60}
          min_bags_to_succeed={4}
        />
      );

      // 4 - 3 = 1 short → singular "bag"
      expect(screen.getByText(/Needs\s*1\s*more\s*bag\s*to\s*settle/i)).toBeTruthy();
    });
  });

  describe("empty state (nothing pledged yet)", () => {
    it("renders the empty-state headline and the configured bag size + min_bags chips", () => {
      currentUnit = "kg";
      render(
        <SellerCampaignPreview
          total_pledged_kg={0}
          bag_size_kg={60}
          min_bags_to_succeed={3}
        />
      );

      // Empty-state copy from the component
      expect(screen.getByText(/Waiting on the first commit/i)).toBeTruthy();
      // Bag size chip — "60 kg / bag"
      expect(screen.getByText(/60\s*kg\s*\/\s*bag/i)).toBeTruthy();
      // Min-bags chip — pluralised since min_bags_to_succeed=3
      expect(screen.getByText(/Needs\s*3\s*bags\s*to\s*settle/i)).toBeTruthy();
    });

    it("uses singular 'bag' in the min-bags chip when min_bags_to_succeed is 1", () => {
      currentUnit = "kg";
      render(
        <SellerCampaignPreview
          total_pledged_kg={0}
          bag_size_kg={60}
          min_bags_to_succeed={1}
        />
      );

      expect(screen.getByText(/Needs\s*1\s*bag\s*to\s*settle/i)).toBeTruthy();
    });
  });

  describe("exact bag multiple (180 kg / 60 kg bags)", () => {
    it("does NOT render the in-progress percentage line", () => {
      currentUnit = "kg";
      render(
        <SellerCampaignPreview
          total_pledged_kg={180}
          bag_size_kg={60}
          min_bags_to_succeed={1}
        />
      );

      // No "Bag 4" partial line (since inProgressKg = 0)
      expect(screen.queryByText(/Bag\s*4/i)).toBeNull();
      // No "% full" line either
      expect(screen.queryByText(/\d+%\s*full/i)).toBeNull();
    });

    it("renders the 'all bags filled cleanly' variant instead", () => {
      currentUnit = "kg";
      render(
        <SellerCampaignPreview
          total_pledged_kg={180}
          bag_size_kg={60}
          min_bags_to_succeed={1}
        />
      );

      expect(screen.getByText(/All bags filled cleanly/i)).toBeTruthy();
    });
  });

  describe("error state (invalid bag_size_kg)", () => {
    it("renders the backfill-required copy when bag_size_kg is 0", () => {
      currentUnit = "kg";
      render(
        <SellerCampaignPreview
          total_pledged_kg={120}
          bag_size_kg={0}
          min_bags_to_succeed={1}
        />
      );

      // The headline directs the seller to fix bag size
      expect(screen.getByText(/Bag Size Missing/i)).toBeTruthy();
      // Instructional copy mentions backfill
      expect(screen.getByText(/Backfill this lot/i)).toBeTruthy();
      // Active-state UI is absent — no "Pledged so far" label
      expect(screen.queryByText(/Pledged so far/i)).toBeNull();
    });
  });

  describe("lb/kg unit toggle", () => {
    it("renders kg values in lb when unit preference is lb", () => {
      currentUnit = "lb";
      render(
        <SellerCampaignPreview
          total_pledged_kg={187}
          bag_size_kg={60}
          min_bags_to_succeed={1}
        />
      );

      // 187 kg → 412.26... → "412.3" with maxFractionDigits=1
      expect(screen.getByText("412.3")).toBeTruthy();
      // 60 kg → 132.27... → "132.3" appears in the "/ 132.3 lb ea" suffix
      expect(screen.getByText(/132\.3\s*lb\s*ea/i)).toBeTruthy();
    });

    it("renders kg values in kg when unit preference is kg", () => {
      currentUnit = "kg";
      render(
        <SellerCampaignPreview
          total_pledged_kg={187}
          bag_size_kg={60}
          min_bags_to_succeed={1}
        />
      );

      // Kg path: total reads as "187"
      expect(screen.getByText("187")).toBeTruthy();
      // The "/ 60 kg ea" suffix on the completed-bags block
      expect(screen.getByText(/60\s*kg\s*ea/i)).toBeTruthy();
    });
  });
});

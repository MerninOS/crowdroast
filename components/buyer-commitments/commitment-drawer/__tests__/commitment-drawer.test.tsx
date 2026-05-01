// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("@/components/unit-provider", () => ({
  useUnitPreference: () => ({ unit: "kg", setUnit: () => {} }),
}));

// Capture which `side` the DrawerContent receives so we can assert on it.
// The real Drawer (Radix-based) drives slide direction off this prop, so it's
// what determines responsive rendering. Mocking the package keeps the test
// out of the npm-link / dupe-React rabbit hole and isolates the side decision.
const sideSpy = vi.fn();
vi.mock("@merninos/ui", () => {
  const Pass = ({ children, asChild, ...rest }: any) => <div {...rest}>{children}</div>;
  return {
    Drawer: ({ open, children }: any) => (open ? <div role="dialog">{children}</div> : null),
    DrawerContent: ({ side, children, ...rest }: any) => {
      sideSpy(side);
      return (
        <div data-side={side} {...rest}>
          {children}
        </div>
      );
    },
    DrawerHeader: Pass,
    DrawerTitle: ({ children }: any) => <h2>{children}</h2>,
    DrawerDescription: ({ children }: any) => <p>{children}</p>,
    DrawerBody: Pass,
    DrawerClose: Pass,
    DrawerFooter: Pass,
    DrawerOverlay: Pass,
    DrawerPortal: Pass,
    DrawerTrigger: Pass,
    Button: ({ children, asChild, ...rest }: any) => <div {...rest}>{children}</div>,
  };
});

import { CommitmentDrawer } from "@/components/buyer-commitments/commitment-drawer";
import type { CommitmentGroup } from "@/components/buyer-commitments/bucket-by-lifecycle";

function makeGroup(): CommitmentGroup {
  return {
    groupKey: "g-1",
    lotId: "lot-1",
    campaignId: "camp-1",
    hubId: "hub-1",
    lot: {
      id: "lot-1",
      seller_id: "s-1",
      title: "Test Lot",
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
      committed_quantity_kg: 500,
      min_commitment_kg: 600,
      price_per_kg: 10,
      currency: "USD",
      status: "active",
      commitment_deadline: null,
      expiry_date: null,
      settlement_status: "pending",
      settlement_processed_at: null,
      images: [],
      flavor_notes: [],
      certifications: [],
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-01T00:00:00Z",
    } as any,
    campaign: {
      id: "camp-1",
      status: "active",
      deadline: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      settled_at: null,
    },
    commitments: [],
    shipment: null,
  };
}

function setMatchMedia(mobile: boolean) {
  // mobile = below 768px → matchMedia("(min-width: 768px)").matches === false
  window.matchMedia = ((query: string) =>
    ({
      matches: mobile ? false : true,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    } as MediaQueryList)) as any;
}

describe("CommitmentDrawer responsive (C3)", () => {
  beforeEach(() => {
    sideSpy.mockClear();
  });

  it("uses side='right' when viewport is at or above 768px", () => {
    setMatchMedia(false); // matches: true → desktop
    render(
      <CommitmentDrawer
        open={true}
        onOpenChange={() => {}}
        group={makeGroup()}
        tiers={[]}
      />
    );
    expect(sideSpy).toHaveBeenLastCalledWith("right");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("uses side='bottom' when viewport is below 768px", () => {
    setMatchMedia(true); // matches: false → mobile
    render(
      <CommitmentDrawer
        open={true}
        onOpenChange={() => {}}
        group={makeGroup()}
        tiers={[]}
      />
    );
    expect(sideSpy).toHaveBeenLastCalledWith("bottom");
  });
});

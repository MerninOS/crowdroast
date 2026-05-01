// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React, { useState } from "react";

// Mock @merninos/ui Drawer parts to avoid the npm-link / dupe-React symlink
// issue in unit tests. We're testing the wrapper's state management; Radix
// Dialog's own behavior is verified via the manual cross-browser sweep in
// Stage 4. The mock preserves the contract: Drawer fires onOpenChange(false)
// when the user dispatches a Dialog-style close (Esc keydown on the body).
vi.mock("@merninos/ui", () => {
  const React = require("react") as typeof import("react");
  const Drawer = ({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: React.ReactNode;
  }) => {
    React.useEffect(() => {
      if (!open) return;
      const handler = (e: KeyboardEvent) => {
        if (e.key === "Escape") onOpenChange(false);
      };
      document.addEventListener("keydown", handler);
      return () => document.removeEventListener("keydown", handler);
    }, [open, onOpenChange]);
    if (!open) return null;
    return <div role="dialog">{children}</div>;
  };
  const Passthrough = ({ children, ...rest }: any) => <div {...rest}>{children}</div>;
  return {
    Drawer,
    DrawerContent: Passthrough,
    DrawerHeader: Passthrough,
    DrawerTitle: ({ children }: any) => <h2>{children}</h2>,
    DrawerDescription: ({ children }: any) => <p>{children}</p>,
    DrawerBody: Passthrough,
    DrawerClose: Passthrough,
    DrawerFooter: Passthrough,
    DrawerOverlay: Passthrough,
    DrawerPortal: Passthrough,
    DrawerTrigger: Passthrough,
  };
});

import { BuyerCommitmentsBoard } from "@/components/buyer-commitments/buyer-commitments-board";
import type {
  BucketedGroups,
  CommitmentGroup,
} from "@/components/buyer-commitments/bucket-by-lifecycle";

// The cards are heavy — stub them so this test stays scoped to the wrapper.
vi.mock("@/components/buyer-commitments/raising-lot-card", () => ({
  RaisingLotCard: ({ group }: { group: CommitmentGroup }) => (
    <div data-testid={`raising-card-${group.groupKey}`}>{group.lot?.title}</div>
  ),
}));
vi.mock("@/components/buyer-commitments/in-motion-lot-card", () => ({
  InMotionLotCard: ({ group }: { group: CommitmentGroup }) => (
    <div data-testid={`in-motion-card-${group.groupKey}`}>{group.lot?.title}</div>
  ),
}));
vi.mock("@/components/buyer-commitments/closed-lots-table", () => ({
  ClosedLotsTable: ({ groups }: { groups: CommitmentGroup[] }) => (
    <div data-testid="closed-lots-table">
      {groups.map((g) => (
        <div key={g.groupKey} data-testid={`closed-row-${g.groupKey}`}>
          {g.lot?.title}
        </div>
      ))}
    </div>
  ),
}));

function makeGroup(overrides: Partial<CommitmentGroup>): CommitmentGroup {
  return {
    groupKey: "default-key",
    lotId: "lot-1",
    campaignId: "camp-1",
    hubId: null,
    lot: {
      id: "lot-1",
      seller_id: "s-1",
      title: "Default Lot",
      origin_country: "Ethiopia",
      region: "Yirgacheffe",
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
    ...overrides,
  };
}

function makeBuckets(overrides: Partial<BucketedGroups> = {}): BucketedGroups {
  return {
    needsAttention: [],
    raising: [],
    inMotion: [],
    closed: [],
    ...overrides,
  };
}

describe("BuyerCommitmentsBoard", () => {
  it("renders each section when its bucket has groups", () => {
    const buckets = makeBuckets({
      raising: [makeGroup({ groupKey: "g-r", lotId: "lot-r" })],
      inMotion: [],
      closed: [],
    });
    render(
      <BuyerCommitmentsBoard
        buckets={buckets}
        tiersByLotId={{}}
        landingKg={0}
        ytdSpend={0}
      />
    );
    expect(screen.getByTestId("section-raising")).toBeInTheDocument();
    expect(screen.queryByTestId("section-in-motion")).not.toBeInTheDocument();
    expect(screen.queryByTestId("section-closed")).not.toBeInTheDocument();
  });

  it("does not render the drawer when no group is open (controlled mode)", () => {
    render(
      <BuyerCommitmentsBoard
        buckets={makeBuckets({ raising: [makeGroup({ groupKey: "g-1" })] })}
        tiersByLotId={{}}
        landingKg={0}
        ytdSpend={0}
        openGroupKey={null}
        onOpenGroupKeyChange={() => {}}
      />
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("mounts the drawer with the correct group when openGroupKey is set", () => {
    const group = makeGroup({
      groupKey: "g-1",
      lot: { ...(makeGroup({}).lot as any), title: "Yirgacheffe Spring 2026" },
    });
    render(
      <BuyerCommitmentsBoard
        buckets={makeBuckets({ raising: [group] })}
        tiersByLotId={{}}
        landingKg={0}
        ytdSpend={0}
        openGroupKey="g-1"
        onOpenGroupKeyChange={() => {}}
      />
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog.textContent).toContain("Yirgacheffe Spring 2026");
    // Raising stage → Raising body placeholder
    expect(screen.getByTestId("drawer-body-raising")).toBeInTheDocument();
  });

  it("notifies the parent when the drawer is closed (controlled mode)", async () => {
    const onChange = vi.fn();
    function Harness() {
      const [key, setKey] = useState<string | null>("g-1");
      return (
        <BuyerCommitmentsBoard
          buckets={makeBuckets({ raising: [makeGroup({ groupKey: "g-1" })] })}
          tiersByLotId={{}}
          landingKg={0}
          ytdSpend={0}
          openGroupKey={key}
          onOpenGroupKeyChange={(k) => {
            onChange(k);
            setKey(k);
          }}
        />
      );
    }
    render(<Harness />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Simulate user pressing Escape — Radix Dialog's standard close behavior.
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.keyDown(document.activeElement || document.body, { key: "Escape" });

    expect(onChange).toHaveBeenCalledWith(null);
  });
});

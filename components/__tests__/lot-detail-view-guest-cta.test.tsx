// @vitest-environment jsdom

/**
 * Criteria 3 & 4 — LotDetailView renders gated CTA for unauthenticated guests.
 *
 * Criterion 3: Guest sees "Request access to this hub to commit" button;
 *              CommitmentForm is absent.
 * Criterion 4: The CTA links to /auth/sign-up, not /auth/login.
 *
 * Failure cases caught:
 * - CTA text reverts to "Sign in to commit" → test fails
 * - CTA href changes to /auth/login → test fails
 * - CommitmentForm renders alongside the CTA → test fails
 * - Both buttons render simultaneously (condition bug) → test fails
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// Mock hooks and complex child components to isolate the CTA rendering logic
vi.mock("@/components/unit-provider", () => ({
  useUnitPreference: () => "lb",
}));

vi.mock("@/components/commitment-form", () => ({
  CommitmentForm: () => <div data-testid="commitment-form">CommitmentForm</div>,
}));

vi.mock("@/components/sample-request-button", () => ({
  SampleRequestButton: () => null,
}));

vi.mock("@/components/unit-value", () => ({
  UnitPriceText: ({ pricePerKg }: { pricePerKg: number }) => <span>{pricePerKg}</span>,
  UnitWeightText: ({ kg }: { kg: number }) => <span>{kg}</span>,
}));

vi.mock("@/lib/pricing", () => ({
  addPlatformFee: (price: number) => price * 1.1,
}));

import { LotDetailView } from "@/components/lot-detail-view";
import type { Lot } from "@/lib/types";

const mockLot: Lot = {
  id: "lot-123",
  title: "Ethiopia Yirgacheffe Natural",
  status: "active",
  origin_country: "Ethiopia",
  region: "Yirgacheffe",
  price_per_kg: 8.5,
  currency: "USD",
  committed_quantity_kg: 200,
  min_commitment_kg: 500,
  total_quantity_kg: 1000,
  commitment_deadline: null,
  seller_id: "seller-abc",
  images: [],
  flavor_notes: ["blueberry", "jasmine"],
  score: 88,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  seller: {
    company_name: "Altura Green Coffee",
    contact_name: "João M.",
    country: "Brazil",
  },
} as unknown as Lot;

describe("LotDetailView — guest CTA (userId=null)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the gated CTA with correct text when userId is null", () => {
    render(
      <LotDetailView
        lot={mockLot}
        userId={null}
        viewerRole="buyer"
        hubId={null}
        pricingTiers={[]}
        commitments={[]}
      />
    );

    expect(
      screen.getByText(/request access to this hub to commit/i)
    ).toBeInTheDocument();
  });

  it("CTA links to /auth/sign-up, not /auth/login", () => {
    render(
      <LotDetailView
        lot={mockLot}
        userId={null}
        viewerRole="buyer"
        hubId={null}
        pricingTiers={[]}
        commitments={[]}
      />
    );

    const cta = screen.getByRole("link", {
      name: /request access to this hub to commit/i,
    });
    expect(cta).toHaveAttribute("href", "/auth/sign-up");
  });

  it("does not render CommitmentForm when userId is null", () => {
    render(
      <LotDetailView
        lot={mockLot}
        userId={null}
        viewerRole="buyer"
        hubId={null}
        pricingTiers={[]}
        commitments={[]}
      />
    );

    expect(screen.queryByTestId("commitment-form")).not.toBeInTheDocument();
  });

  it("does not render the gated CTA when userId is provided", () => {
    render(
      <LotDetailView
        lot={mockLot}
        userId="user-456"
        viewerRole="buyer"
        hubId="hub-789"
        pricingTiers={[]}
        commitments={[]}
      />
    );

    expect(
      screen.queryByText(/request access to this hub to commit/i)
    ).not.toBeInTheDocument();
  });
});

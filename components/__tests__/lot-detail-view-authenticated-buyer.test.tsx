// @vitest-environment jsdom

/**
 * Regression net for the upcoming buyer-campaign-page redesign refactor.
 *
 * The redesign extracts the inline commit form out of LotDetailView into a
 * dedicated <CommitForm> and replaces the body of LotDetailView with a new
 * <CampaignPage /> orchestrator. That refactor is risky — this file is 700+
 * lines and the only existing test (lot-detail-view-guest-cta.test.tsx)
 * covers guest-only paths.
 *
 * This test asserts the *authenticated buyer* happy path stays intact:
 *   - lot title renders
 *   - CommitmentForm is mounted (auth path is active)
 *   - guest-gated CTA is absent (auth path is active, not the guest fallback)
 *
 * If any of these flip after the refactor lands, the buyer-side commit
 * surface has regressed and the refactor needs to back out.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

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

const renderAuthenticatedBuyer = () =>
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

describe("LotDetailView — authenticated buyer happy path (regression net)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the lot title", () => {
    renderAuthenticatedBuyer();
    expect(
      screen.getByText("Ethiopia Yirgacheffe Natural")
    ).toBeInTheDocument();
  });

  it("mounts the CommitmentForm (auth path is active)", () => {
    renderAuthenticatedBuyer();
    expect(screen.getByTestId("commitment-form")).toBeInTheDocument();
  });

  it("does not render the guest-gated CTA when authenticated", () => {
    renderAuthenticatedBuyer();
    expect(
      screen.queryByText(/request access to this hub to commit/i)
    ).not.toBeInTheDocument();
  });
});

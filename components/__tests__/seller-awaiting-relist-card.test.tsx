// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// Stub the mocked router, toast, and Button/Dialog primitives so we can render the
// component in isolation without pulling in real navigation or toast transports.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { SellerAwaitingRelistCard } from "@/components/seller-awaiting-relist-card";

const baseProps = {
  lotId: "lot-1",
  lotTitle: "Ethiopian Yirgacheffe",
  expiryDate: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  campaign: {
    hubName: "Portland Hub",
    deadline: new Date(Date.now() - 86_400_000).toISOString(),
    committedKg: 42.5,
    buyerCount: 7,
  },
};

describe("SellerAwaitingRelistCard", () => {
  it("shows the settled banner copy when outcome is settled", () => {
    render(<SellerAwaitingRelistCard {...baseProps} outcome="settled" />);
    expect(screen.getByText(/Settled/i)).toBeInTheDocument();
    expect(screen.getByText("Ethiopian Yirgacheffe")).toBeInTheDocument();
    expect(screen.getByText("Portland Hub")).toBeInTheDocument();
  });

  it("shows the failed banner copy when outcome is failed", () => {
    render(<SellerAwaitingRelistCard {...baseProps} outcome="failed" />);
    expect(screen.getByText(/Did not meet minimum/i)).toBeInTheDocument();
  });

  it("shows the cancelled banner copy when outcome is cancelled", () => {
    render(<SellerAwaitingRelistCard {...baseProps} outcome="cancelled" />);
    expect(screen.getByText(/Cancelled by hub/i)).toBeInTheDocument();
  });

  it("shows the expired banner copy and supports a null campaign summary", () => {
    render(
      <SellerAwaitingRelistCard
        {...baseProps}
        outcome="expired"
        campaign={null}
      />
    );
    expect(screen.getByText(/Expired without a campaign/i)).toBeInTheDocument();
    expect(screen.queryByText(/Committed/i)).not.toBeInTheDocument();
  });

  it("disables the Relist button and shows a hint when expiry has passed", () => {
    render(
      <SellerAwaitingRelistCard
        {...baseProps}
        outcome="settled"
        expiryDate={new Date(Date.now() - 86_400_000).toISOString()}
      />
    );
    const relistButton = screen.getByRole("button", { name: /relist/i });
    expect(relistButton).toBeDisabled();
    expect(
      screen.getByText(/Update the expiry date before relisting/i)
    ).toBeInTheDocument();
  });

  it("enables Relist when expiry is in the future", () => {
    render(<SellerAwaitingRelistCard {...baseProps} outcome="settled" />);
    const relistButton = screen.getByRole("button", { name: /relist/i });
    expect(relistButton).not.toBeDisabled();
  });
});

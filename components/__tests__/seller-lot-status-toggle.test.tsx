// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { SellerLotStatusToggle } from "@/components/seller-lot-status-toggle";

describe("SellerLotStatusToggle", () => {
  it("renders Set Inactive when current status is active and no live campaign", () => {
    render(
      <SellerLotStatusToggle
        lotId="lot-1"
        currentStatus="active"
        hasActiveCampaign={false}
      />
    );
    expect(screen.getByRole("button", { name: /Set Inactive/i })).toBeInTheDocument();
  });

  it("renders Set Active when current status is draft", () => {
    render(<SellerLotStatusToggle lotId="lot-1" currentStatus="draft" />);
    expect(screen.getByRole("button", { name: /Set Active/i })).toBeInTheDocument();
  });

  it("renders nothing when an active campaign exists for the lot", () => {
    const { container } = render(
      <SellerLotStatusToggle
        lotId="lot-1"
        currentStatus="active"
        hasActiveCampaign={true}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { InviteShareCard } from "../InviteShareCard";

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_CLIPBOARD = navigator.clipboard;

beforeEach(() => {
  // Stub clipboard.writeText
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn(async () => undefined) },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  Object.defineProperty(navigator, "clipboard", {
    value: ORIGINAL_CLIPBOARD,
    writable: true,
    configurable: true,
  });
});

describe("<InviteShareCard />", () => {
  it("renders the URL once the get-or-create endpoint resolves", async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: "abc1234567",
            url: "https://crowdroast.test/i/abc1234567",
            hubName: "East Side",
            hubCity: "Austin",
          }),
          { status: 200 }
        )
    ) as unknown as typeof fetch;

    render(<InviteShareCard />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("https://crowdroast.test/i/abc1234567")).toBeInTheDocument();
    });
    expect(screen.getByText(/East Side/)).toBeInTheDocument();
    expect(screen.getByText(/Pickup happens at Austin/i)).toBeInTheDocument();
  });

  it("Copy link button writes the URL to clipboard and flashes 'Copied!'", async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: "abc1234567",
            url: "https://crowdroast.test/i/abc1234567",
            hubName: "East Side",
            hubCity: "Austin",
          }),
          { status: 200 }
        )
    ) as unknown as typeof fetch;

    render(<InviteShareCard />);
    const button = await screen.findByRole("button", { name: /Copy link/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "https://crowdroast.test/i/abc1234567"
      );
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Copied!/i })).toBeInTheDocument();
    });
  });

  it("renders nothing when the buyer has no active hub (403 from endpoint)", async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "active_hub_membership_required" }), { status: 403 })
    ) as unknown as typeof fetch;

    const { container } = render(<InviteShareCard />);
    await waitFor(() => {
      // Component returns null when join_a_hub_first error is set.
      expect(container.innerHTML).toBe("");
    });
  });

  it("shows a friendly error on a generic load failure", async () => {
    global.fetch = vi.fn(async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    render(<InviteShareCard />);
    await waitFor(() => {
      expect(screen.getByText(/Something went sideways/i)).toBeInTheDocument();
    });
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Stub next/navigation's useRouter — the button calls router.push() on success.
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { InviteAcceptButton } from "../InviteAcceptButton";

const ORIGINAL_FETCH = global.fetch;

beforeEach(() => {
  pushMock.mockReset();
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
});

describe("<InviteAcceptButton />", () => {
  it("renders 'Join [HubName]' button using the passed hub name", () => {
    render(<InviteAcceptButton code="abc1234567" hubName="East Side Roasters" />);
    expect(screen.getByRole("button", { name: /Join East Side Roasters/i })).toBeInTheDocument();
  });

  it("on success: routes the user to /dashboard", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ joined: true }), { status: 200 })) as unknown as typeof fetch;
    render(<InviteAcceptButton code="abc1234567" hubName="East Side" />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("on different_hub_active: shows the friendly switching-not-supported message", async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: "different_hub_active", currentHubName: "Other Hub" }),
          { status: 409 }
        )
    ) as unknown as typeof fetch;
    render(<InviteAcceptButton code="abc1234567" hubName="East Side" />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(screen.getByText(/already in Other Hub/i)).toBeInTheDocument();
      expect(screen.getByText(/Switching hubs isn't supported/i)).toBeInTheDocument();
    });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("on self_invite_not_allowed: shows 'your own invite link'", async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "self_invite_not_allowed" }), { status: 400 })
    ) as unknown as typeof fetch;
    render(<InviteAcceptButton code="abc1234567" hubName="East Side" />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(screen.getByText(/your own invite link/i)).toBeInTheDocument();
    });
  });

  it("on network failure: shows the generic try-again copy and remains clickable", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    render(<InviteAcceptButton code="abc1234567" hubName="East Side" />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(screen.getByText(/Try again in a moment/i)).toBeInTheDocument();
    });
    // Submitting state should reset so the button is re-enabled.
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false);
  });
});

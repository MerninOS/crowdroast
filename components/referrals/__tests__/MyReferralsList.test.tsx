// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MyReferralsList } from "../MyReferralsList";

const ORIGINAL_FETCH = global.fetch;

beforeEach(() => {});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
});

describe("<MyReferralsList />", () => {
  it("empty state when no referrals", async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ joined: [], pending: [], earned: [], voided: [] }),
          { status: 200 }
        )
    ) as unknown as typeof fetch;

    render(<MyReferralsList />);
    await waitFor(() => {
      expect(screen.getByText(/No invites yet/i)).toBeInTheDocument();
      expect(screen.getByText(/\$10 per friend/i)).toBeInTheDocument();
    });
  });

  it("renders all four statuses with correct badges", async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            joined: [
              {
                id: "j-1",
                status: "joined",
                earned_at: null,
                created_at: "2026-04-25",
                invitee: { contact_name: "Just-Joined Jane", company_name: null },
              },
            ],
            pending: [
              {
                id: "p-1",
                status: "pending",
                earned_at: null,
                created_at: "2026-04-01",
                invitee: { contact_name: "Pending Pat", company_name: null },
              },
            ],
            earned: [
              {
                id: "e-1",
                status: "earned",
                earned_at: "2026-04-15",
                created_at: "2026-04-10",
                invitee: { contact_name: "Earned Eve", company_name: null },
              },
            ],
            voided: [
              {
                id: "v-1",
                status: "voided",
                earned_at: null,
                created_at: "2026-04-05",
                invitee: { contact_name: null, company_name: "Voided Co" },
              },
            ],
          }),
          { status: 200 }
        )
    ) as unknown as typeof fetch;

    render(<MyReferralsList />);
    await waitFor(() => {
      expect(screen.getByText("Just-Joined Jane")).toBeInTheDocument();
      expect(screen.getByText("Pending Pat")).toBeInTheDocument();
      expect(screen.getByText("Earned Eve")).toBeInTheDocument();
      expect(screen.getByText("Voided Co")).toBeInTheDocument();
    });

    // Header counts.
    expect(screen.getByText(/2 waiting/i)).toBeInTheDocument(); // joined + pending
    expect(screen.getByText(/1 earned/i)).toBeInTheDocument();

    // Badges per status, including the new joined pill.
    expect(screen.getByText("No commit yet")).toBeInTheDocument();
    expect(screen.getByText("Brewing")).toBeInTheDocument();
    expect(screen.getByText("Earned")).toBeInTheDocument();
    expect(screen.getByText(/Lot fell through/i)).toBeInTheDocument();
  });

  it("hides 'waiting' header count when nobody is waiting", async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            joined: [],
            pending: [],
            earned: [
              {
                id: "e-1",
                status: "earned",
                earned_at: "2026-04-15",
                created_at: "2026-04-10",
                invitee: { contact_name: "Earned Eve", company_name: null },
              },
            ],
            voided: [],
          }),
          { status: 200 }
        )
    ) as unknown as typeof fetch;

    render(<MyReferralsList />);
    await waitFor(() => {
      expect(screen.getByText("Earned Eve")).toBeInTheDocument();
    });
    expect(screen.queryByText(/waiting/i)).not.toBeInTheDocument();
  });

  it("falls back to 'A new roaster' when invitee has no name", async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            joined: [
              {
                id: "j-1",
                status: "joined",
                earned_at: null,
                created_at: "2026-04-01",
                invitee: { contact_name: null, company_name: null },
              },
            ],
            pending: [],
            earned: [],
            voided: [],
          }),
          { status: 200 }
        )
    ) as unknown as typeof fetch;

    render(<MyReferralsList />);
    await waitFor(() => {
      expect(screen.getByText("A new roaster")).toBeInTheDocument();
    });
  });

  it("error state on load failure", async () => {
    global.fetch = vi.fn(async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    render(<MyReferralsList />);
    await waitFor(() => {
      expect(screen.getByText(/Couldn't load/i)).toBeInTheDocument();
    });
  });
});

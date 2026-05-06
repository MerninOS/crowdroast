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
        new Response(JSON.stringify({ pending: [], earned: [], voided: [] }), { status: 200 })
    ) as unknown as typeof fetch;

    render(<MyReferralsList />);
    await waitFor(() => {
      expect(screen.getByText(/No invites sent yet/i)).toBeInTheDocument();
      expect(screen.getByText(/\$10 per friend/i)).toBeInTheDocument();
    });
  });

  it("renders rows grouped pending then earned then voided, with status badges", async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
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
      expect(screen.getByText("Pending Pat")).toBeInTheDocument();
      expect(screen.getByText("Earned Eve")).toBeInTheDocument();
      expect(screen.getByText("Voided Co")).toBeInTheDocument();
    });

    // Counts in the header.
    expect(screen.getByText(/1 brewing/i)).toBeInTheDocument();
    expect(screen.getByText(/1 earned/i)).toBeInTheDocument();

    // Badge labels per status.
    expect(screen.getByText("Brewing")).toBeInTheDocument();
    expect(screen.getByText("Earned")).toBeInTheDocument();
    expect(screen.getByText(/Lot fell through/i)).toBeInTheDocument();
  });

  it("falls back to 'A new roaster' when invitee has no name", async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            pending: [
              {
                id: "p-1",
                status: "pending",
                earned_at: null,
                created_at: "2026-04-01",
                invitee: { contact_name: null, company_name: null },
              },
            ],
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

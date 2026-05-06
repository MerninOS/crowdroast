// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CreditBalanceCard } from "../CreditBalanceCard";

const ORIGINAL_FETCH = global.fetch;

beforeEach(() => {});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
});

describe("<CreditBalanceCard />", () => {
  it("zero-balance empty state", async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ balance_cents: 0, ledger: [] }), { status: 200 })
    ) as unknown as typeof fetch;

    render(<CreditBalanceCard />);
    await waitFor(() => {
      expect(screen.getByText("$0.00")).toBeInTheDocument();
      expect(screen.getByText(/Invite a friend/i)).toBeInTheDocument();
    });
  });

  it("positive balance shown in dollars; history hidden by default", async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            balance_cents: 1500,
            ledger: [
              {
                id: "l-1",
                amount_cents: 1000,
                reason: "referral_earned",
                source_attribution_id: "a-1",
                source_commitment_id: null,
                granted_by_admin_id: null,
                note: null,
                created_at: "2026-04-01",
              },
              {
                id: "l-2",
                amount_cents: 500,
                reason: "admin_adjust",
                source_attribution_id: null,
                source_commitment_id: null,
                granted_by_admin_id: "admin-1",
                note: "thanks for early adopting",
                created_at: "2026-04-15",
              },
            ],
          }),
          { status: 200 }
        )
    ) as unknown as typeof fetch;

    render(<CreditBalanceCard />);
    await waitFor(() => {
      expect(screen.getByText("$15.00")).toBeInTheDocument();
    });
    // History collapsed by default.
    expect(screen.queryByText(/Earned: friend joined/i)).not.toBeInTheDocument();
    // Toggle reveals rows.
    fireEvent.click(screen.getByRole("button", { name: /Show history/i }));
    expect(screen.getByText(/Earned: friend joined/i)).toBeInTheDocument();
    expect(screen.getByText(/CrowdRoast adjustment: thanks for early adopting/i)).toBeInTheDocument();
  });

  it("renders negative amounts (commit_applied) without leading double-minus", async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            balance_cents: 200,
            ledger: [
              {
                id: "l-1",
                amount_cents: 1000,
                reason: "referral_earned",
                source_attribution_id: "a-1",
                source_commitment_id: null,
                granted_by_admin_id: null,
                note: null,
                created_at: "2026-04-01",
              },
              {
                id: "l-2",
                amount_cents: -800,
                reason: "commit_applied",
                source_attribution_id: null,
                source_commitment_id: "c-1",
                granted_by_admin_id: null,
                note: null,
                created_at: "2026-05-01",
              },
            ],
          }),
          { status: 200 }
        )
    ) as unknown as typeof fetch;

    render(<CreditBalanceCard />);
    await waitFor(() => {
      expect(screen.getByText("$2.00")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /Show history/i }));
    expect(screen.getByText("-$8.00")).toBeInTheDocument();
    expect(screen.queryByText("--$8.00")).not.toBeInTheDocument();
  });

  it("error state on load failure", async () => {
    global.fetch = vi.fn(async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    render(<CreditBalanceCard />);
    await waitFor(() => {
      expect(screen.getByText(/Couldn't load/i)).toBeInTheDocument();
    });
  });
});

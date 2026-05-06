// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CreditGrantForm } from "../CreditGrantForm";

const ORIGINAL_FETCH = global.fetch;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
});

describe("<CreditGrantForm />", () => {
  it("posts a positive grant in cents (dollars × 100) and shows new balance", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ledger_row: {
            id: "l-1",
            amount_cents: 5000,
            reason: "admin_adjust",
            granted_by_admin_id: "admin-1",
            note: "make-good",
            created_at: "2026-05-06",
          },
          balance_cents: 5000,
        }),
        { status: 201 }
      )
    );

    render(<CreditGrantForm />);
    fireEvent.change(screen.getByLabelText(/User ID/i), { target: { value: "u-1" } });
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: "50.00" } });
    fireEvent.change(screen.getByLabelText(/Note/i), { target: { value: "make-good" } });
    fireEvent.click(screen.getByRole("button", { name: /Grant credits/i }));

    await waitFor(() => {
      expect(screen.getByText(/New balance: \$50\.00/)).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/credits/grant",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ user_id: "u-1", amount_cents: 5000, note: "make-good" }),
      })
    );
  });

  it("negative grants are accepted (admin can deduct)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ledger_row: {
            id: "l-2",
            amount_cents: -1500,
            reason: "admin_adjust",
            granted_by_admin_id: "admin-1",
            note: null,
            created_at: "2026-05-06",
          },
          balance_cents: 3500,
        }),
        { status: 201 }
      )
    );

    render(<CreditGrantForm />);
    fireEvent.change(screen.getByLabelText(/User ID/i), { target: { value: "u-1" } });
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: "-15" } });
    fireEvent.click(screen.getByRole("button", { name: /Grant credits/i }));

    await waitFor(() => {
      expect(screen.getByText(/New balance: \$35\.00/)).toBeInTheDocument();
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      amount_cents: -1500,
    });
  });

  it("rejects zero amount client-side without hitting the endpoint", async () => {
    render(<CreditGrantForm />);
    fireEvent.change(screen.getByLabelText(/User ID/i), { target: { value: "u-1" } });
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /Grant credits/i }));
    await waitFor(() => {
      expect(screen.getByText(/non-zero/i)).toBeInTheDocument();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders endpoint error inline", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "user_not_found" }), { status: 404 })
    );
    render(<CreditGrantForm />);
    fireEvent.change(screen.getByLabelText(/User ID/i), { target: { value: "ghost" } });
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: /Grant credits/i }));
    await waitFor(() => {
      expect(screen.getByText(/user_not_found/i)).toBeInTheDocument();
    });
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { FailedPaymentsSection, type FailedPaymentRow } from "../failed-payments-section";

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_CONFIRM = global.confirm;
let fetchMock: ReturnType<typeof vi.fn>;

function makeRow(overrides: Partial<FailedPaymentRow> = {}): FailedPaymentRow {
  return {
    id: "charge-1",
    commitment_id: "c-1",
    bag_number: 2,
    kg: 30,
    amount_cents: 27000,
    attempt_count: 3,
    failed_reason: "card_declined",
    created_at: "2026-05-10T00:00:00Z",
    payment_status: "payment_failed",
    buyer: {
      id: "b-1",
      email: "buyer@example.com",
      contact_name: "Test Buyer",
      company_name: null,
    },
    lot: { id: "lot-1", title: "Costa Rica Reserve", seller_id: "s-1" },
    ...overrides,
  };
}

beforeEach(() => {
  fetchMock = vi.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  global.confirm = vi.fn(() => true);
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  global.confirm = ORIGINAL_CONFIRM;
  vi.restoreAllMocks();
});

describe("<FailedPaymentsSection />", () => {
  it("renders the empty state in Mernin' voice when there are no rows", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
    render(<FailedPaymentsSection />);
    await waitFor(() => {
      expect(screen.getByText(/No failed payments\. Smooth sailing\./i)).toBeInTheDocument();
    });
  });

  it("renders all 4 action buttons for each failed row", async () => {
    const rows = [makeRow()];
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(rows), { status: 200 }));
    render(<FailedPaymentsSection />);

    await waitFor(() => {
      expect(screen.getByText(/Test Buyer/)).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /Retry manually/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cover \(platform\)/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cover \(hub\)/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancel bag portion/i })).toBeInTheDocument();

    // Money + bag number rendering
    expect(screen.getByText("$270.00")).toBeInTheDocument();
    expect(screen.getByText(/#2.*30kg/)).toBeInTheDocument();
  });

  it("Retry manually POSTs the right body and drops the row from the list", async () => {
    const rows = [makeRow()];
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(rows), { status: 200 }));
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          charge_id: "charge-1",
          new_payment_status: "awaiting_charge",
          ops_action_id: "audit-1",
        }),
        { status: 200 }
      )
    );

    render(<FailedPaymentsSection />);
    await waitFor(() => expect(screen.getByText(/Test Buyer/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Retry manually/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("/api/admin/failed-payments");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ charge_id: "charge-1", action: "retry_charge", notes: null });

    // Row is removed from the UI after success.
    await waitFor(() =>
      expect(screen.queryByText(/Test Buyer/)).not.toBeInTheDocument()
    );
  });

  it("Cover (platform) POSTs the mark_covered_by_platform action", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([makeRow()]), { status: 200 }));
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, charge_id: "charge-1", new_payment_status: "charged", ops_action_id: "a" }), { status: 200 })
    );

    render(<FailedPaymentsSection />);
    await waitFor(() => expect(screen.getByText(/Test Buyer/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Cover \(platform\)/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      action: "mark_covered_by_platform",
    });
  });

  it("Cover (hub) POSTs the mark_covered_by_hub action", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([makeRow()]), { status: 200 }));
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, charge_id: "charge-1", new_payment_status: "charged", ops_action_id: "a" }), { status: 200 })
    );

    render(<FailedPaymentsSection />);
    await waitFor(() => expect(screen.getByText(/Test Buyer/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Cover \(hub\)/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      action: "mark_covered_by_hub",
    });
  });

  it("Cancel bag portion requires notes — no POST without them", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([makeRow()]), { status: 200 }));

    render(<FailedPaymentsSection />);
    await waitFor(() => expect(screen.getByText(/Test Buyer/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Cancel bag portion/i }));

    // Only the initial GET fired — no POST.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("Cancel bag portion POSTs cancel_bag_portion with notes when notes are present", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([makeRow()]), { status: 200 }));
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, charge_id: "charge-1", new_payment_status: "payment_failed", ops_action_id: "a" }), { status: 200 })
    );

    render(<FailedPaymentsSection />);
    await waitFor(() => expect(screen.getByText(/Test Buyer/)).toBeInTheDocument());

    const notesField = screen.getByLabelText(/Notes for Test Buyer/i);
    fireEvent.change(notesField, { target: { value: "Buyer unreachable; bag will ship short." } });

    fireEvent.click(screen.getByRole("button", { name: /Cancel bag portion/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      action: "cancel_bag_portion",
      notes: "Buyer unreachable; bag will ship short.",
    });
  });

  it("aborts the action if window.confirm returns false", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([makeRow()]), { status: 200 }));
    global.confirm = vi.fn(() => false);

    render(<FailedPaymentsSection />);
    await waitFor(() => expect(screen.getByText(/Test Buyer/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Retry manually/i }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows the failed reason from the row when present", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify([makeRow({ failed_reason: "insufficient_funds" })]), {
        status: 200,
      })
    );
    render(<FailedPaymentsSection />);
    await waitFor(() => {
      expect(screen.getByText("insufficient_funds")).toBeInTheDocument();
    });
  });

  it("falls back gracefully when buyer/lot are missing", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify([makeRow({ buyer: null, lot: null })]), { status: 200 })
    );
    render(<FailedPaymentsSection />);
    await waitFor(() => {
      expect(screen.getByText(/Unknown buyer/)).toBeInTheDocument();
      expect(screen.getByText(/Unknown lot/)).toBeInTheDocument();
    });
  });

  // Anti-regression: keep the row count check honest. If we ever default to
  // showing zero rows for any reason, the test above with one row should fail.
  it("renders a separate row per failed charge", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          makeRow({ id: "c-a", commitment_id: "x" }),
          makeRow({ id: "c-b", commitment_id: "y", buyer: { ...makeRow().buyer!, contact_name: "Other Buyer" } }),
        ]),
        { status: 200 }
      )
    );
    render(<FailedPaymentsSection />);
    await waitFor(() => expect(screen.getByText(/Test Buyer/)).toBeInTheDocument());
    expect(screen.getByText(/Other Buyer/)).toBeInTheDocument();

    // Each row has its own 4 buttons → 8 total.
    expect(screen.getAllByRole("button", { name: /Retry manually/i })).toHaveLength(2);

    // Sanity: a single row container per charge id.
    const rowsRendered = document.querySelectorAll("[data-row-id]");
    expect(rowsRendered.length).toBe(2);
    expect(rowsRendered[0].getAttribute("data-row-id")).toBe("c-a");
    expect(rowsRendered[1].getAttribute("data-row-id")).toBe("c-b");
    // Avoid unused import warning
    void within;
  });
});

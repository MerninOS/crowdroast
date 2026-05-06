"use client";

import { useState } from "react";

type GrantResponse = {
  ledger_row: {
    id: string;
    amount_cents: number;
    reason: string;
    granted_by_admin_id: string;
    note: string | null;
    created_at: string;
  };
  balance_cents: number;
};

export function CreditGrantForm() {
  const [userId, setUserId] = useState("");
  const [amountDollars, setAmountDollars] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<GrantResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);

    const amountCents = Math.round(parseFloat(amountDollars) * 100);
    if (!Number.isInteger(amountCents) || amountCents === 0) {
      setError("Enter a non-zero dollar amount.");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/credits/grant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          user_id: userId.trim(),
          amount_cents: amountCents,
          note: note.trim() || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error || "Couldn't grant credits.");
        setSubmitting(false);
        return;
      }
      setResult(body as GrantResponse);
      setAmountDollars("");
      setNote("");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border-3 p-6 flex flex-col gap-4"
      style={{
        background: "#FDFAF0",
        borderColor: "#1C0F05",
        boxShadow: "5px 5px 0 #1C0F05",
      }}
    >
      <div>
        <label
          htmlFor="user_id"
          className="block text-xs font-bold uppercase tracking-[0.08em] mb-1"
          style={{ color: "#1C0F05" }}
        >
          User ID
        </label>
        <input
          id="user_id"
          type="text"
          required
          placeholder="uuid"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="w-full rounded-md border-2 px-3 py-2 text-sm font-mono"
          style={{ borderColor: "#1C0F05", background: "#F5F0D8", color: "#1C0F05" }}
        />
      </div>

      <div>
        <label
          htmlFor="amount"
          className="block text-xs font-bold uppercase tracking-[0.08em] mb-1"
          style={{ color: "#1C0F05" }}
        >
          Amount (dollars; negative deducts)
        </label>
        <input
          id="amount"
          type="number"
          step="0.01"
          required
          placeholder="10.00"
          value={amountDollars}
          onChange={(e) => setAmountDollars(e.target.value)}
          className="w-full rounded-md border-2 px-3 py-2 text-sm"
          style={{ borderColor: "#1C0F05", background: "#F5F0D8", color: "#1C0F05" }}
        />
      </div>

      <div>
        <label
          htmlFor="note"
          className="block text-xs font-bold uppercase tracking-[0.08em] mb-1"
          style={{ color: "#1C0F05" }}
        >
          Note (audit trail)
        </label>
        <textarea
          id="note"
          rows={2}
          placeholder="why this adjustment was made"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-md border-2 px-3 py-2 text-sm"
          style={{ borderColor: "#1C0F05", background: "#F5F0D8", color: "#1C0F05" }}
        />
      </div>

      <div className="flex items-center justify-between">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-pill border-3 px-6 py-2 text-xs font-bold uppercase tracking-[0.1em] transition disabled:opacity-60"
          style={{
            borderColor: "#1C0F05",
            background: "#E8442A",
            color: "#F5F0D8",
            boxShadow: "3px 3px 0 #1C0F05",
          }}
        >
          {submitting ? "Granting…" : "Grant credits"}
        </button>

        {result && (
          <p className="text-xs font-bold" style={{ color: "#5A7A3A" }}>
            ✓ Done. New balance: ${(result.balance_cents / 100).toFixed(2)}
          </p>
        )}
        {error && (
          <p className="text-xs font-bold" style={{ color: "#1C0F05" }}>
            {error}
          </p>
        )}
      </div>
    </form>
  );
}

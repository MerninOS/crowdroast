"use client";

import { useEffect, useState } from "react";

type LedgerRow = {
  id: string;
  amount_cents: number;
  reason: "referral_earned" | "commit_applied" | "admin_adjust";
  source_attribution_id: string | null;
  source_commitment_id: string | null;
  granted_by_admin_id: string | null;
  note: string | null;
  created_at: string;
};

type CreditsData = {
  balance_cents: number;
  ledger: LedgerRow[];
};

function formatDollars(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

function describeRow(row: LedgerRow): string {
  if (row.reason === "referral_earned") return "Earned: friend joined and committed";
  if (row.reason === "commit_applied") return "Applied to a recent commitment";
  if (row.reason === "admin_adjust") {
    return row.note ? `CrowdRoast adjustment: ${row.note}` : "CrowdRoast adjustment";
  }
  return "Adjustment";
}

export function CreditBalanceCard() {
  const [data, setData] = useState<CreditsData | null>(null);
  const [error, setError] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/credits/me");
        if (cancelled) return;
        if (!res.ok) {
          setError(true);
          return;
        }
        setData(await res.json());
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className="rounded-xl border-3 p-5"
      style={{
        background: "#FDFAF0",
        borderColor: "#1C0F05",
        boxShadow: "5px 5px 0 #1C0F05",
      }}
    >
      <h3 className="text-base font-bold uppercase tracking-[0.08em]" style={{ color: "#1C0F05" }}>
        Credit balance
      </h3>

      {error || !data ? (
        <p className="text-xs mt-2 font-medium" style={{ color: "#7A6A50" }}>
          {error ? "Couldn't load — try refreshing." : "Loading…"}
        </p>
      ) : (
        <>
          <div className="mt-2 mb-1 flex items-baseline gap-2">
            <span
              className="text-4xl font-bold"
              style={{ color: "#1C0F05", fontFamily: "'Cal Sans', system-ui, sans-serif" }}
            >
              {formatDollars(data.balance_cents)}
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: "#7A6A50" }}>
              auto-applies on settle
            </span>
          </div>

          {data.ledger.length === 0 ? (
            <p className="text-sm mt-2 font-medium" style={{ color: "#7A6A50" }}>
              No credits yet. Invite a friend — when their first commitment closes, you'll see $10 land here.
            </p>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setShowHistory((v) => !v)}
                className="text-[11px] font-bold uppercase tracking-[0.08em] mt-2 underline underline-offset-4"
                style={{ color: "#1C0F05" }}
              >
                {showHistory ? "Hide history" : `Show history (${data.ledger.length})`}
              </button>

              {showHistory && (
                <ul className="flex flex-col gap-1 mt-3">
                  {data.ledger.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-center justify-between rounded-md border-2 px-3 py-2 text-sm"
                      style={{ borderColor: "#1C0F05", background: "#F5F0D8" }}
                    >
                      <span className="font-medium" style={{ color: "#1C0F05" }}>
                        {describeRow(row)}
                      </span>
                      <span
                        className="font-bold"
                        style={{
                          color: row.amount_cents > 0 ? "#5A7A3A" : "#1C0F05",
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        {row.amount_cents > 0 ? "+" : ""}
                        {formatDollars(row.amount_cents)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

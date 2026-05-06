"use client";

import { useEffect, useState } from "react";

type InviteData = {
  code: string;
  url: string;
  hubName: string;
  hubCity: string | null;
};

// Subdued dashboard mode card. Calls POST /api/invite-codes (idempotent) on
// mount to get-or-create the buyer's invite link, then exposes a copy-link
// action. Hidden on the server side when the buyer has no active hub
// membership (the route returns 403 in that case so this component renders
// a no-op fallback).
export function InviteShareCard() {
  const [data, setData] = useState<InviteData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/invite-codes", { method: "POST" });
        if (cancelled) return;
        if (!res.ok) {
          setError(res.status === 403 ? "join_a_hub_first" : "load_failed");
          setLoading(false);
          return;
        }
        const body = (await res.json()) as InviteData;
        setData(body);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError("load_failed");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCopy() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Some browsers / iframe contexts block clipboard writes silently.
      setCopied(false);
    }
  }

  // Hide for users not in a hub — the dashboard's other surfaces nudge them
  // toward joining one. No empty-state needed here.
  if (error === "join_a_hub_first") return null;

  return (
    <div
      className="rounded-xl border-3 p-5"
      style={{
        background: "var(--color-chalk, #FDFAF0)",
        borderColor: "var(--color-espresso, #1C0F05)",
        boxShadow: "5px 5px 0 #1C0F05",
      }}
    >
      <div className="mb-3">
        <h3
          className="text-base font-bold uppercase tracking-[0.08em]"
          style={{ color: "#1C0F05" }}
        >
          Bring a friend
        </h3>
        <p className="text-xs mt-1 font-medium" style={{ color: "#7A6A50" }}>
          {data
            ? `Share your link. When a friend joins ${data.hubName} and commits, you earn $10 in credits.`
            : "Loading your invite link…"}
        </p>
      </div>

      {loading && (
        <p className="text-xs font-medium" style={{ color: "#7A6A50" }}>
          Brewing your link…
        </p>
      )}

      {error === "load_failed" && (
        <p className="text-sm font-medium" style={{ color: "#1C0F05" }}>
          Something went sideways. Refresh and try again.
        </p>
      )}

      {data && (
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            readOnly
            value={data.url}
            className="flex-1 rounded-md border-2 px-3 py-2 text-sm font-mono"
            style={{
              borderColor: "#1C0F05",
              background: "#F5F0D8",
              color: "#1C0F05",
            }}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-pill border-3 px-5 py-2 text-xs font-bold uppercase tracking-[0.1em] transition"
            style={{
              borderColor: "#1C0F05",
              background: copied ? "#5A7A3A" : "#E8442A",
              color: "#F5F0D8",
              boxShadow: "3px 3px 0 #1C0F05",
            }}
          >
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>
      )}

      {data?.hubCity && data && (
        <p className="text-[10px] mt-3 font-medium uppercase tracking-[0.08em]" style={{ color: "#7A6A50" }}>
          ✦ Pickup happens at {data.hubCity}
        </p>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

type Status = "joined" | "pending" | "earned" | "voided";

type Row = {
  id: string;
  status: Status;
  earned_at: string | null;
  created_at: string;
  invitee: { contact_name: string | null; company_name: string | null } | null;
};

type Groups = {
  joined: Row[];
  pending: Row[];
  earned: Row[];
  voided: Row[];
};

const STATUS_LABEL: Record<Status, string> = {
  joined: "No commit yet",
  pending: "Brewing",
  earned: "Earned",
  voided: "Lot fell through",
};

const STATUS_BG: Record<Status, string> = {
  joined: "#FDFAF0", // chalk — quiet, neutral, signals "waiting"
  pending: "#D8D0B8", // fog
  earned: "#5A7A3A", // matcha
  voided: "#7A6A50", // muted brown
};

const STATUS_TEXT: Record<Status, string> = {
  joined: "#7A6A50",
  pending: "#1C0F05",
  earned: "#F5F0D8",
  voided: "#F5F0D8",
};

export function MyReferralsList() {
  const [groups, setGroups] = useState<Groups | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/referrals/me");
        if (cancelled) return;
        if (!res.ok) {
          setError(true);
          return;
        }
        setGroups(await res.json());
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error || !groups) {
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
          Your invites
        </h3>
        <p className="text-xs mt-2 font-medium" style={{ color: "#7A6A50" }}>
          {error ? "Couldn't load — try refreshing." : "Loading…"}
        </p>
      </div>
    );
  }

  // Order matters: earned (good news) → pending → joined (waiting) → voided.
  const all = [
    ...groups.earned,
    ...groups.pending,
    ...groups.joined,
    ...groups.voided,
  ];
  const total = all.length;
  const waitingCount = groups.joined.length + groups.pending.length;

  return (
    <div
      className="rounded-xl border-3 p-5"
      style={{
        background: "#FDFAF0",
        borderColor: "#1C0F05",
        boxShadow: "5px 5px 0 #1C0F05",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-bold uppercase tracking-[0.08em]" style={{ color: "#1C0F05" }}>
          Your invites
        </h3>
        <div className="flex gap-2 text-[11px] font-bold uppercase tracking-[0.08em]">
          {waitingCount > 0 && (
            <span style={{ color: "#7A6A50" }}>{waitingCount} waiting</span>
          )}
          <span style={{ color: "#5A7A3A" }}>
            {groups.earned.length} earned
          </span>
        </div>
      </div>

      {total === 0 ? (
        <p className="text-sm font-medium" style={{ color: "#7A6A50" }}>
          No invites yet. Share your link above and earn $10 per friend who commits.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {all.map((row) => {
            const name =
              row.invitee?.contact_name ||
              row.invitee?.company_name ||
              "A new roaster";
            return (
              <li
                key={row.id}
                className="flex items-center justify-between rounded-md border-2 px-3 py-2 text-sm"
                style={{ borderColor: "#1C0F05", background: "#F5F0D8" }}
              >
                <span className="font-medium" style={{ color: "#1C0F05" }}>
                  {name}
                </span>
                <span
                  className="rounded-pill border-2 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]"
                  style={{
                    borderColor: "#1C0F05",
                    background: STATUS_BG[row.status],
                    color: STATUS_TEXT[row.status],
                  }}
                >
                  {STATUS_LABEL[row.status]}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

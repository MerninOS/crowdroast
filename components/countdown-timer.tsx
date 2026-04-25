"use client";
import { useState, useEffect } from "react";

function parse(deadline: string) {
  const diff = Math.max(0, new Date(deadline).getTime() - Date.now());
  if (diff === 0) return null;
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
  };
}

const Seg = ({ v, l }: { v: number; l: string }) => (
  <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", minWidth: 30 }}>
    <span style={{ fontFamily: "'Adore Cats', 'Fredoka', cursive", fontSize: 22, lineHeight: 0.95, color: "#F5F0D8", fontVariantNumeric: "tabular-nums" }}>
      {String(v).padStart(2, "0")}
    </span>
    <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase" as const, opacity: 0.7, marginTop: 2, color: "#F5F0D8", fontFamily: "'Cal Sans', system-ui, sans-serif" }}>
      {l}
    </span>
  </span>
);

const Sep = () => (
  <span style={{ fontFamily: "'Adore Cats', 'Fredoka', cursive", fontSize: 22, lineHeight: 1, opacity: 0.4, color: "#F5F0D8" }}>:</span>
);

export function CountdownTimer({ deadline }: { deadline: string | null | undefined }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!deadline || now === null) return null;

  const diff = Math.max(0, new Date(deadline).getTime() - now);
  const ended = diff === 0;

  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ fontFamily: "'Cal Sans', system-ui, sans-serif", fontSize: 10.5, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "#F5C842" }}>
        {ended ? "Campaign ended" : "Closes in"}
      </div>
      {!ended && (
        <div style={{ display: "inline-flex", alignItems: "flex-start", gap: 4 }}>
          {d > 0 && <><Seg v={d} l="D" /><Sep /></>}
          <Seg v={h} l="H" />
          <Sep />
          <Seg v={m} l="M" />
          <Sep />
          <Seg v={s} l="S" />
        </div>
      )}
    </div>
  );
}

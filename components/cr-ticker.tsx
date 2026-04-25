"use client";

const PRICE_ITEMS = [
  { sym: "ETH·YIRG", px: "6.40", d: "+0.12", up: true },
  { sym: "COL·CAUC", px: "7.80", d: "−0.05", up: false },
  { sym: "GUA·HUEH", px: "5.90", d: "+0.08", up: true },
  { sym: "PAN·GSHA", px: "38.00", d: "+1.20", up: true },
  { sym: "KEN·NYRI", px: "8.20", d: "+0.03", up: true },
  { sym: "RWA·NYNG", px: "6.10", d: "−0.02", up: false },
  { sym: "BUR·KAYN", px: "5.75", d: "+0.15", up: true },
  { sym: "CRI·TARR", px: "9.40", d: "−0.10", up: false },
  { sym: "HON·MRCL", px: "5.20", d: "+0.04", up: true },
  { sym: "BRA·CRRD", px: "4.80", d: "+0.01", up: true },
];

const NEWS_ITEMS = [
  { tag: "COMMIT", txt: "Little Wolf +44 lb to Yirgacheffe" },
  { tag: "CUP", txt: "Mother Hub scores Lot 4 at 88.5" },
  { tag: "CLOSE", txt: "Huehue Bourbon 40 lb from sell-out" },
  { tag: "JOIN", txt: "Passenger Coffee joined the pack" },
  { tag: "SHIP", txt: "Container 047 departed Buenaventura" },
  { tag: "COMMIT", txt: "Onyx +110 lb to Panama Gesha" },
  { tag: "CUP", txt: "Antigua Cafés scores Huehue at 86" },
  { tag: "NEW", txt: "Kenya Nyeri AA washed — lot opens Fri" },
];

const L: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};

function TickerTrack({
  children,
  speed = 80,
  reverse = false,
}: {
  children: React.ReactNode;
  speed?: number;
  reverse?: boolean;
}) {
  return (
    <div style={{ overflow: "hidden", display: "flex", whiteSpace: "nowrap", flex: 1 }}>
      <div
        style={{
          display: "inline-flex",
          animation: `ticker-${reverse ? "r" : "l"} ${speed}s linear infinite`,
        }}
      >
        <div style={{ display: "inline-flex", flexShrink: 0 }}>{children}</div>
        <div style={{ display: "inline-flex", flexShrink: 0 }}>{children}</div>
      </div>
    </div>
  );
}

export function CrTicker() {
  const priceNodes = PRICE_ITEMS.map((t, i) => (
    <div
      key={i}
      style={{
        padding: "6px 16px",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontSize: 12,
        borderRight: "1px dashed rgba(239,231,207,.12)",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-body)",
          fontWeight: 800,
          letterSpacing: "0.04em",
          color: "var(--cr-bg)",
        }}
      >
        {t.sym}
      </span>
      <span
        style={{
          fontFamily: "var(--font-body)",
          fontWeight: 700,
          opacity: 0.9,
          color: "var(--cr-bg)",
        }}
      >
        ${t.px}
      </span>
      <span
        style={{
          fontFamily: "var(--font-body)",
          fontWeight: 700,
          color: t.up ? "#8DC084" : "#E8913A",
        }}
      >
        {t.d}
      </span>
    </div>
  ));

  const newsNodes = NEWS_ITEMS.map((n, i) => (
    <div
      key={i}
      style={{
        padding: "6px 16px",
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        fontSize: 12,
        borderRight: "1px dashed rgba(239,231,207,.12)",
      }}
    >
      <span
        style={{
          ...L,
          fontSize: 9,
          color: "var(--cr-accent-2)",
        }}
      >
        {n.tag}
      </span>
      <span style={{ opacity: 0.95, color: "var(--cr-bg)" }}>{n.txt}</span>
    </div>
  ));

  return (
    <div
      style={{
        background: "var(--cr-ink)",
        borderBottom: "3px solid var(--cr-ink)",
      }}
    >
      {/* FOB prices track */}
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          borderBottom: "1px dashed rgba(239,231,207,.15)",
        }}
      >
        <div
          style={{
            ...L,
            fontSize: 10,
            background: "var(--cr-accent)",
            color: "var(--cr-accent-fg)",
            padding: "6px 14px",
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
            borderRight: "1px solid var(--cr-ink)",
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "var(--cr-accent-2)",
              animation: "cr-pulse 1.8s infinite",
              display: "inline-block",
            }}
          />
          FOB · LIVE
        </div>
        <TickerTrack speed={90}>{priceNodes}</TickerTrack>
      </div>

      {/* The Wire activity track */}
      <div style={{ display: "flex", alignItems: "stretch" }}>
        <div
          style={{
            ...L,
            fontSize: 10,
            background: "var(--cr-accent-2)",
            color: "var(--cr-ink)",
            padding: "6px 14px",
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
            borderRight: "1px solid var(--cr-ink)",
          }}
        >
          · the wire
        </div>
        <TickerTrack speed={75} reverse>
          {newsNodes}
        </TickerTrack>
      </div>
    </div>
  );
}

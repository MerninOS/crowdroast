"use client";

import { useUnitPreference } from "@/components/unit-provider";
import { formatUnitWeight } from "@/lib/units";

type BagProgressBarProps = {
  total_pledged_kg: number;
  bag_size_kg: number;
  /** Minimum number of completed bags required for the campaign to settle. Defaults to 1. */
  min_bags_to_succeed?: number;
};

/**
 * Campaign-level bag-fill progress display.
 * Renders the count of locked bags, the in-progress bag fill, and an optional
 * minimum-to-succeed nudge. Pure presentational — no data fetching.
 */
export function BagProgressBar({
  total_pledged_kg,
  bag_size_kg,
  min_bags_to_succeed = 1,
}: BagProgressBarProps) {
  const { unit } = useUnitPreference();

  // Defensive: bag_size_kg must be > 0 to compute progress.
  const safeBagSize = bag_size_kg > 0 ? bag_size_kg : 1;
  const completedBags = Math.floor(total_pledged_kg / safeBagSize);
  const inProgressKg = total_pledged_kg - completedBags * safeBagSize;
  const remainingKg = Math.max(0, safeBagSize - inProgressKg);
  const inProgressPct =
    inProgressKg > 0 ? Math.min(100, (inProgressKg / safeBagSize) * 100) : 0;
  const currentBagNumber = completedBags + 1;
  const bagsShortOfMin = Math.max(0, min_bags_to_succeed - completedBags);
  const showMinHint = min_bags_to_succeed > 1 && bagsShortOfMin > 0;
  const bagLabel = completedBags === 1 ? "bag" : "bags";
  const remainingLabel = bagsShortOfMin === 1 ? "bag" : "bags";

  // ---- Empty state: nothing pledged yet ----
  if (total_pledged_kg <= 0) {
    return (
      <section
        aria-label="Bag progress"
        className="font-body"
        style={{
          background: "#FDFAF0",
          border: "4px solid #1C0F05",
          borderRadius: 20,
          boxShadow: "5px 5px 0 #1C0F05",
          padding: "1.25rem 1.5rem",
          color: "#1C0F05",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 10.5,
                fontWeight: 800,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "#7a6a50",
                marginBottom: 4,
              }}
            >
              Bag Progress
            </div>
            <div
              style={{
                fontFamily: "'Adore Cats', 'Fredoka', cursive",
                fontSize: "2.5rem",
                lineHeight: 1,
                color: "#1C0F05",
              }}
            >
              First bag&apos;s waiting
            </div>
          </div>
          <div
            style={{
              background: "#F5C842",
              border: "3px solid #1C0F05",
              borderRadius: 9999,
              padding: "6px 14px",
              fontFamily: "var(--font-body)",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#1C0F05",
              boxShadow: "3px 3px 0 #1C0F05",
              whiteSpace: "nowrap",
            }}
          >
            {formatUnitWeight(bag_size_kg, unit, 1)} {unit} / bag
          </div>
        </div>
      </section>
    );
  }

  // ---- Active state ----
  return (
    <section
      aria-label="Bag progress"
      className="font-body"
      style={{
        background: "#FDFAF0",
        border: "4px solid #1C0F05",
        borderRadius: 20,
        boxShadow: "5px 5px 0 #1C0F05",
        padding: "1.25rem 1.5rem",
        color: "#1C0F05",
      }}
    >
      {/* Headline row: locked bag count */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 10.5,
              fontWeight: 800,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#7a6a50",
              marginBottom: 4,
            }}
          >
            Bag Progress
          </div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "baseline",
              gap: "0.75rem",
            }}
          >
            <span
              style={{
                fontFamily: "'Adore Cats', 'Fredoka', cursive",
                fontSize: "4rem",
                lineHeight: 0.9,
                color: "#1C0F05",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {completedBags}
            </span>
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#1C0F05",
              }}
            >
              {bagLabel} locked
            </span>
          </div>
        </div>

        {/* Bag-size pill — orient the reader on what a "bag" means here */}
        <div
          style={{
            background: "#1C0F05",
            border: "3px solid #1C0F05",
            borderRadius: 9999,
            padding: "6px 14px",
            fontFamily: "var(--font-body)",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#F5F0D8",
            whiteSpace: "nowrap",
          }}
        >
          {formatUnitWeight(bag_size_kg, unit, 1)} {unit} / bag
        </div>
      </div>

      {/* In-progress bag fill */}
      {inProgressKg > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              fontFamily: "var(--font-body)",
              fontSize: 13,
              fontWeight: 700,
              color: "#1C0F05",
              marginBottom: 8,
              gap: "0.5rem",
              flexWrap: "wrap",
            }}
          >
            <span>
              <span
                style={{
                  fontFamily: "'Adore Cats', 'Fredoka', cursive",
                  fontSize: 22,
                  marginRight: 8,
                  verticalAlign: "-2px",
                }}
              >
                Bag {currentBagNumber}
              </span>
              filling:{" "}
              <span
                style={{
                  fontWeight: 800,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {Math.round(inProgressPct)}%
              </span>
            </span>
            <span style={{ color: "#7a6a50", fontWeight: 700 }}>
              {formatUnitWeight(inProgressKg, unit, 1)} {unit} pledged ·{" "}
              {formatUnitWeight(remainingKg, unit, 1)} {unit} from completion
            </span>
          </div>

          {/* Sticker-style progress bar — tomato fill on chalk track */}
          <div
            role="progressbar"
            aria-valuenow={Math.round(inProgressPct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Bag ${currentBagNumber} filling`}
            style={{
              position: "relative",
              height: 18,
              background: "#F5F0D8",
              border: "3px solid #1C0F05",
              borderRadius: 9999,
              overflow: "hidden",
              boxShadow: "3px 3px 0 #1C0F05",
            }}
          >
            <div
              style={{
                width: `${inProgressPct}%`,
                height: "100%",
                background: "#E8442A",
                transition: "width 220ms cubic-bezier(0.34, 1.56, 0.64, 1)",
              }}
            />
          </div>
        </div>
      )}

      {/* Minimum-to-succeed nudge */}
      {showMinHint && (
        <div
          style={{
            marginTop: "1rem",
            background: "#F5C842",
            border: "3px solid #1C0F05",
            borderRadius: 12,
            padding: "8px 14px",
            fontFamily: "var(--font-body)",
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#1C0F05",
            display: "inline-block",
            boxShadow: "3px 3px 0 #1C0F05",
          }}
        >
          Need {bagsShortOfMin} more {remainingLabel} to settle
        </div>
      )}
    </section>
  );
}

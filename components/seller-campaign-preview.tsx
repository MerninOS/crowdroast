"use client";

import { useUnitPreference } from "@/components/unit-provider";
import { formatUnitWeight } from "@/lib/units";

type SellerCampaignPreviewProps = {
  total_pledged_kg: number;
  bag_size_kg: number;
  min_bags_to_succeed: number;
};

/**
 * Seller-facing campaign preview. Renders forward-looking bag projections
 * (current total pledged, completed bag count, in-progress fill %, projected
 * final bag count, on-track status) for an active campaign. Pure presentational;
 * no data fetching. Respects the user's lb/kg unit preference for display only.
 */
export function SellerCampaignPreview({
  total_pledged_kg,
  bag_size_kg,
  min_bags_to_succeed,
}: SellerCampaignPreviewProps): React.JSX.Element {
  const { unit } = useUnitPreference();

  // ---- Error state: invalid bag size — seller must fix this ----
  if (bag_size_kg <= 0 || !Number.isFinite(bag_size_kg)) {
    return (
      <section
        aria-label="Campaign preview"
        className="font-body"
        style={{
          background: "#FDFAF0",
          border: "4px solid #1C0F05",
          borderRadius: 20,
          boxShadow: "5px 5px 0 #E8442A",
          padding: "1.5rem 1.75rem",
          color: "#1C0F05",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "#E8442A",
            marginBottom: 6,
          }}
        >
          Bag Size Missing
        </div>
        <div
          style={{
            fontFamily: "'Adore Cats', 'Fredoka', cursive",
            fontSize: "2.25rem",
            lineHeight: 1,
            marginBottom: "0.5rem",
          }}
        >
          We can&apos;t do bag math without a bag.
        </div>
        <p
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 14,
            fontWeight: 500,
            color: "#3B1F0A",
            margin: 0,
          }}
        >
          Backfill this lot&apos;s bag size to unlock the live campaign preview.
        </p>
      </section>
    );
  }

  const completedBags = Math.floor(total_pledged_kg / bag_size_kg);
  const inProgressKg = total_pledged_kg - completedBags * bag_size_kg;
  const inProgressPct =
    inProgressKg > 0 ? Math.round((inProgressKg / bag_size_kg) * 100) : 0;
  const currentBagNumber = completedBags + 1;
  const onTrack = completedBags >= min_bags_to_succeed;
  const bagsShort = Math.max(0, min_bags_to_succeed - completedBags);
  const minBagsLabel = min_bags_to_succeed === 1 ? "bag" : "bags";
  const shortLabel = bagsShort === 1 ? "bag" : "bags";
  const settleLabel = completedBags === 1 ? "bag" : "bags";

  // ---- Empty state: nothing pledged yet ----
  if (total_pledged_kg <= 0) {
    return (
      <section
        aria-label="Campaign preview"
        className="font-body"
        style={{
          background: "#FDFAF0",
          border: "4px solid #1C0F05",
          borderRadius: 20,
          boxShadow: "5px 5px 0 #1C0F05",
          padding: "1.5rem 1.75rem",
          color: "#1C0F05",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "#7a6a50",
            marginBottom: 6,
          }}
        >
          Live Campaign Preview
        </div>
        <div
          style={{
            fontFamily: "'Adore Cats', 'Fredoka', cursive",
            fontSize: "2.75rem",
            lineHeight: 1,
            marginBottom: "1rem",
          }}
        >
          Waiting on the first commit
        </div>
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              background: "#1C0F05",
              color: "#F5F0D8",
              border: "3px solid #1C0F05",
              borderRadius: 9999,
              padding: "6px 14px",
              fontFamily: "var(--font-body)",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            {formatUnitWeight(bag_size_kg, unit, 1)} {unit} / bag
          </span>
          <span
            style={{
              background: "#F5C842",
              color: "#1C0F05",
              border: "3px solid #1C0F05",
              borderRadius: 9999,
              padding: "6px 14px",
              fontFamily: "var(--font-body)",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              boxShadow: "3px 3px 0 #1C0F05",
            }}
          >
            Needs {min_bags_to_succeed} {minBagsLabel} to settle
          </span>
        </div>
      </section>
    );
  }

  // ---- Active state ----
  return (
    <section
      aria-label="Campaign preview"
      className="font-body"
      style={{
        background: "#FDFAF0",
        border: "4px solid #1C0F05",
        borderRadius: 20,
        boxShadow: "5px 5px 0 #1C0F05",
        padding: "1.5rem 1.75rem",
        color: "#1C0F05",
      }}
    >
      {/* Header row: label + on-track sticker */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "1rem",
          flexWrap: "wrap",
          marginBottom: "1.25rem",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "#7a6a50",
          }}
        >
          Live Campaign Preview
        </div>

        {/* Status sticker — starburst-style badge */}
        <span
          role="status"
          aria-live="polite"
          style={{
            background: onTrack ? "#5A7A3A" : "#E8442A",
            color: "#F5F0D8",
            border: "3px solid #1C0F05",
            borderRadius: 9999,
            padding: "8px 16px",
            fontFamily: "var(--font-body)",
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            boxShadow: "3px 3px 0 #1C0F05",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          {onTrack ? (
            <>
              <span aria-hidden="true">✓</span>
              On track to settle
            </>
          ) : (
            <>
              <span aria-hidden="true">⚠</span>
              Needs {bagsShort} more {shortLabel} to settle
            </>
          )}
        </span>
      </div>

      {/* Big-number grid: pledged total + completed bag count */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "1.25rem",
          alignItems: "end",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 10.5,
              fontWeight: 800,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#7a6a50",
              marginBottom: 4,
            }}
          >
            Pledged so far
          </div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "baseline",
              gap: "0.5rem",
            }}
          >
            <span
              style={{
                fontFamily: "'Adore Cats', 'Fredoka', cursive",
                fontSize: "3.75rem",
                lineHeight: 0.9,
                color: "#1C0F05",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatUnitWeight(total_pledged_kg, unit, 1)}
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
              {unit}
            </span>
          </div>
        </div>

        <div>
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 10.5,
              fontWeight: 800,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#7a6a50",
              marginBottom: 4,
            }}
          >
            Completed bags
          </div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "baseline",
              gap: "0.5rem",
            }}
          >
            <span
              style={{
                fontFamily: "'Adore Cats', 'Fredoka', cursive",
                fontSize: "3.75rem",
                lineHeight: 0.9,
                color: "#E8442A",
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
              / {formatUnitWeight(bag_size_kg, unit, 1)} {unit} ea
            </span>
          </div>
        </div>
      </div>

      {/* In-progress fill row OR clean-fill note */}
      {inProgressKg > 0 ? (
        <div
          style={{
            background: "#F5F0D8",
            border: "3px solid #1C0F05",
            borderRadius: 12,
            padding: "0.85rem 1rem",
            marginBottom: "1rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 14,
              fontWeight: 700,
              color: "#1C0F05",
            }}
          >
            <span
              style={{
                fontFamily: "'Adore Cats', 'Fredoka', cursive",
                fontSize: 22,
                marginRight: 6,
                verticalAlign: "-2px",
              }}
            >
              Bag {currentBagNumber}
            </span>
            is{" "}
            <span
              style={{
                fontWeight: 800,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {inProgressPct}%
            </span>{" "}
            full
          </span>
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#7a6a50",
            }}
          >
            {formatUnitWeight(inProgressKg, unit, 1)} /{" "}
            {formatUnitWeight(bag_size_kg, unit, 1)} {unit}
          </span>
        </div>
      ) : (
        <div
          style={{
            background: "#F5F0D8",
            border: "3px dashed #5A7A3A",
            borderRadius: 12,
            padding: "0.85rem 1rem",
            marginBottom: "1rem",
            fontFamily: "var(--font-body)",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "#5A7A3A",
          }}
        >
          All bags filled cleanly — no partial in the wings.
        </div>
      )}

      {/* Projected settle line — forward-looking framing */}
      <div
        style={{
          background: "#1C0F05",
          color: "#F5F0D8",
          border: "3px solid #1C0F05",
          borderRadius: 12,
          padding: "0.85rem 1rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.75rem",
          flexWrap: "wrap",
          boxShadow: "3px 3px 0 #E8442A",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#F5C842",
          }}
        >
          If campaign closed now
        </span>
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 14,
            fontWeight: 800,
            letterSpacing: "0.06em",
            color: "#F5F0D8",
          }}
        >
          Will settle:{" "}
          <span
            style={{
              fontFamily: "'Adore Cats', 'Fredoka', cursive",
              fontSize: 22,
              color: "#F5C842",
              marginRight: 4,
              verticalAlign: "-2px",
            }}
          >
            {completedBags}
          </span>
          {settleLabel}
        </span>
      </div>
    </section>
  );
}

"use client";

import * as React from "react";
import { useUnitPreference } from "@/components/unit-provider";
import { formatUnitWeight } from "@/lib/units";

type CommitSplitWarningProps = {
  /** The buyer's pending kg to commit. */
  pending_kg: number;
  /**
   * Current bag's remaining capacity in kg (kg needed to complete the current
   * open bag). If 0 or negative, the new commit starts a fresh bag immediately.
   */
  bag_remaining_kg: number;
  /** Size of one bag, in kg. */
  bag_size_kg: number;
};

/**
 * Loud warning panel shown at commit-review time when the buyer's pending
 * pledge crosses a bag boundary. Splits the pledge into the kg that completes
 * the current open bag (locks immediately) and the kg that begins a fresh bag
 * (at-risk until the new bag is fully pledged).
 *
 * Pure presentational — no data fetching, no side effects. Renders `null` when
 * the pledge fits entirely inside the current bag.
 */
export function CommitSplitWarning({
  pending_kg,
  bag_remaining_kg,
  bag_size_kg,
}: CommitSplitWarningProps): React.JSX.Element | null {
  const { unit } = useUnitPreference();

  // Normalize: treat negative remaining as "no remainder left in current bag".
  const remaining = Math.max(0, bag_remaining_kg);

  // No cross-boundary — render nothing.
  if (pending_kg <= remaining) {
    return null;
  }

  // The pending pledge crosses the boundary. Split into:
  //   locksKg     -> finishes the current open bag (immediate lock)
  //   atRiskKg    -> starts a fresh bag, at-risk until that bag fills to bag_size_kg
  const locksKg = remaining;
  const atRiskKg = pending_kg - remaining;

  // Edge case: current bag has 0 remaining capacity. The entire pledge is the
  // opening of a brand-new bag — there's nothing to "lock immediately". Skip
  // the Locks row entirely so we don't render "0 kg → completes the bag".
  const showLocksRow = locksKg > 0;

  return (
    <section
      role="alert"
      aria-label="Commit spans a bag boundary"
      className="font-body"
      style={{
        background: "#E8442A",
        border: "5px solid #1C0F05",
        borderRadius: 20,
        boxShadow: "6px 6px 0 #1C0F05",
        padding: "1.25rem 1.5rem",
        color: "#F5F0D8",
      }}
    >
      {/* Headline — Adore Cats statement, sticker energy */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          marginBottom: "1rem",
          flexWrap: "wrap",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#F5C842",
            color: "#1C0F05",
            border: "3px solid #1C0F05",
            borderRadius: 9999,
            width: 36,
            height: 36,
            fontFamily: "var(--font-body)",
            fontSize: 20,
            fontWeight: 900,
            lineHeight: 1,
            boxShadow: "3px 3px 0 #1C0F05",
            flexShrink: 0,
          }}
        >
          !
        </span>
        <h3
          style={{
            margin: 0,
            fontFamily: "'Adore Cats', 'Fredoka', cursive",
            fontSize: "1.85rem",
            lineHeight: 1,
            color: "#F5F0D8",
            textTransform: "none",
          }}
        >
          Heads up — this commit spans a bag boundary
        </h3>
      </div>

      {/* The two split rows */}
      <div style={{ display: "grid", gap: "0.75rem" }}>
        {showLocksRow && (
          <div
            data-testid="commit-split-warning-locks-row"
            style={{
              background: "#5A7A3A",
              color: "#F5F0D8",
              border: "3px solid #1C0F05",
              borderRadius: 14,
              padding: "0.85rem 1rem",
              boxShadow: "4px 4px 0 #1C0F05",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 14,
                fontWeight: 700,
                lineHeight: 1.35,
              }}
            >
              <strong
                style={{
                  fontWeight: 900,
                  fontVariantNumeric: "tabular-nums",
                  fontSize: 18,
                  marginRight: 4,
                }}
              >
                {formatUnitWeight(locksKg, unit, 1)} {unit}
              </strong>
              → completes the current bag
            </span>
            <span
              style={{
                background: "#F5F0D8",
                color: "#1C0F05",
                border: "2px solid #1C0F05",
                borderRadius: 9999,
                padding: "4px 12px",
                fontFamily: "var(--font-body)",
                fontSize: 10.5,
                fontWeight: 800,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
              }}
            >
              Locks immediately ✓
            </span>
          </div>
        )}

        <div
          data-testid="commit-split-warning-atrisk-row"
          style={{
            background: "#F5C842",
            color: "#1C0F05",
            border: "3px solid #1C0F05",
            borderRadius: 14,
            padding: "0.85rem 1rem",
            boxShadow: "4px 4px 0 #1C0F05",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 14,
              fontWeight: 700,
              lineHeight: 1.35,
            }}
          >
            <strong
              style={{
                fontWeight: 900,
                fontVariantNumeric: "tabular-nums",
                fontSize: 18,
                marginRight: 4,
              }}
            >
              {formatUnitWeight(atRiskKg, unit, 1)} {unit}
            </strong>
            → starts a new bag (at-risk until the bag hits{" "}
            <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 900 }}>
              {formatUnitWeight(bag_size_kg, unit, 1)} {unit}
            </span>
            )
          </span>
          <span
            style={{
              background: "#1C0F05",
              color: "#F5C842",
              border: "2px solid #1C0F05",
              borderRadius: 9999,
              padding: "4px 12px",
              fontFamily: "var(--font-body)",
              fontSize: 10.5,
              fontWeight: 800,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            At-risk ⚠
          </span>
        </div>
      </div>

      {/* Encouragement — Mernin' voice, punchy not corporate */}
      <p
        style={{
          marginTop: "1rem",
          marginBottom: 0,
          fontFamily: "var(--font-body)",
          fontSize: 13,
          fontWeight: 700,
          lineHeight: 1.45,
          color: "#F5F0D8",
          opacity: 0.95,
        }}
      >
        Pull a friend in to top off the bag and your kg lock in.
      </p>
    </section>
  );
}

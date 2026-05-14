"use client";

import React from "react";
import { useUnitPreference } from "@/components/unit-provider";
import { formatUnitWeight } from "@/lib/units";

type LockedFillingPillProps = {
  /** kg of this buyer's pledge that have settled into a completed bag. */
  locked_kg: number;
  /** kg of this buyer's pledge that are still in the in-progress (at-risk) bag. */
  filling_kg: number;
  /**
   * Remaining kg needed to complete the in-progress bag (campaign-level context).
   * Pass `null` or `undefined` when no bag is currently filling — e.g. the
   * buyer is fully locked, or the campaign is empty. The "from completion"
   * suffix is omitted in that case.
   */
  bag_remaining_kg?: number | null;
};

/**
 * Compact status pill that summarizes the buyer's bag-aware position on a
 * single commitment. Pure presentational — respects the global lb/kg toggle.
 *
 * States:
 *  - All locked   → one matcha "Locked ✓" pill.
 *  - All filling  → one sun "Filling ⚠" pill, optionally suffixed with the
 *                    campaign's remaining kg to completion.
 *  - Split pledge → two pills side-by-side (Locked + Filling), so the buyer
 *                    can read the two halves of their commitment independently.
 *
 * Design call on the split case: two inline pills, not one combined pill.
 * Each pill carries its own background colour, which is the signal — fusing
 * them dilutes both states and makes the warning easier to miss. Two pills
 * reads cleaner alongside other badges in commitment lists.
 */
export function LockedFillingPill({
  locked_kg,
  filling_kg,
  bag_remaining_kg,
}: LockedFillingPillProps): React.JSX.Element {
  const { unit } = useUnitPreference();

  const hasLocked = locked_kg > 0;
  const hasFilling = filling_kg > 0;

  return (
    <div
      className="font-body"
      style={{
        display: "inline-flex",
        flexWrap: "wrap",
        gap: 6,
        alignItems: "center",
      }}
    >
      {hasLocked && (
        <span
          aria-label={`${formatUnitWeight(locked_kg, unit, 1)} ${unit} locked`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "#5A7A3A",
            color: "#F5F0D8",
            border: "2px solid #1C0F05",
            borderRadius: 9999,
            padding: "3px 12px",
            fontFamily: "var(--font-body)",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            boxShadow: "2px 2px 0 #1C0F05",
            whiteSpace: "nowrap",
            lineHeight: 1.2,
          }}
        >
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatUnitWeight(locked_kg, unit, 1)} {unit}
          </span>
          <span>Locked</span>
          <span aria-hidden="true">✓</span>
        </span>
      )}

      {hasFilling && (
        <span
          aria-label={
            bag_remaining_kg != null && bag_remaining_kg > 0
              ? `${formatUnitWeight(filling_kg, unit, 1)} ${unit} filling — refunds if the bag doesn't complete; ${formatUnitWeight(bag_remaining_kg, unit, 1)} ${unit} from completion`
              : `${formatUnitWeight(filling_kg, unit, 1)} ${unit} filling — refunds if the bag doesn't complete`
          }
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "#F5C842",
            color: "#1C0F05",
            border: "2px solid #1C0F05",
            borderRadius: 9999,
            padding: "3px 12px",
            fontFamily: "var(--font-body)",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            boxShadow: "2px 2px 0 #1C0F05",
            whiteSpace: "nowrap",
            lineHeight: 1.2,
          }}
        >
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatUnitWeight(filling_kg, unit, 1)} {unit}
          </span>
          <span>Filling</span>
          <span aria-hidden="true">⚠</span>
          {bag_remaining_kg != null && bag_remaining_kg > 0 && (
            <span
              style={{
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "none",
                fontVariantNumeric: "tabular-nums",
                opacity: 0.85,
              }}
            >
              ({formatUnitWeight(bag_remaining_kg, unit, 1)} {unit} from
              completion)
            </span>
          )}
        </span>
      )}

      {/* Defensive: render a quiet "Empty" pill rather than nothing if both
          values are zero — keeps the buyer dashboard layout stable. */}
      {!hasLocked && !hasFilling && (
        <span
          aria-label="Nothing pledged yet"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "#FDFAF0",
            color: "#7a6a50",
            border: "2px solid #D8D0B8",
            borderRadius: 9999,
            padding: "3px 12px",
            fontFamily: "var(--font-body)",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            lineHeight: 1.2,
          }}
        >
          Empty
        </span>
      )}
    </div>
  );
}

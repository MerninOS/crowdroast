'use client'

import * as React from 'react'
import { useUnitPreference } from '@/components/unit-provider'
import { formatUnitWeight, toDisplayPricePerUnit } from '@/lib/units'
import { addPlatformFee } from '@/lib/pricing'
import type { PricingTier } from '@/lib/types'

export interface BagGridProgressProps {
  /** Lot bag size in kg. The "what is a bag" denominator. */
  bagSizeKg: number
  /** Total bags available on the lot (= total_quantity_kg / bag_size_kg). */
  totalBags: number
  /** Bags currently locked (= floor(committed_kg / bag_size_kg)). */
  filledBags: number
  /** Fill percent of the current in-progress bag (0–100). */
  inProgressPct: number
  /** Total kg pledged (locked + filling). */
  committedKg: number
  /** Total kg the lot can ship (= bagSizeKg × totalBags). */
  totalKg: number
  /** Base price per kg, before tiers and platform fee. */
  basePricePerKg: number
  /** Tier rows. Bag thresholds preferred; legacy kg falls back. */
  pricingTiers: PricingTier[]
  /** Optional slot rendered below the grid (e.g. invite poke). */
  children?: React.ReactNode
}

type TierFlag = {
  bagThreshold: number
  buyerPricePerUnit: number
}

// Bag-grid campaign progress. Replaces the legacy TierLadder. Each bag is a
// square cell — filled, filling, or empty. Tier prices appear as flag
// markers anchored to the bag column where they unlock.
//
// Why a grid: the prior "Early Tier / Full Tier / Stretch" copy was
// ambiguous, and the percentage bar didn't tell a buyer how many bags they
// or other roasters needed to commit to to unlock the next price. The grid
// answers both questions visually.
export function BagGridProgress({
  bagSizeKg,
  totalBags,
  filledBags,
  inProgressPct,
  committedKg,
  totalKg,
  basePricePerKg,
  pricingTiers,
  children,
}: BagGridProgressProps) {
  const { unit } = useUnitPreference()

  // Defensive clamps — math upstream is trusted but we still guard so a
  // bad prop doesn't render -3 bags or a 14ft-wide grid.
  const safeTotalBags = Math.max(1, Math.floor(totalBags))
  const safeFilledBags = Math.max(0, Math.min(safeTotalBags, Math.floor(filledBags)))
  const safeInProgressPct = Math.max(0, Math.min(100, inProgressPct))

  // Build tier flag markers. Prefer post-cutover `min_bags`; fall back to
  // deriving from legacy `min_quantity_kg / bag_size_kg`. Sort ascending and
  // drop any flag outside [2, totalBags] — a 1-bag or off-grid flag isn't
  // useful as a "next unlock" marker.
  const flags: TierFlag[] = React.useMemo(() => {
    const out: TierFlag[] = []
    for (const tier of pricingTiers) {
      const fromBags =
        typeof tier.min_bags === 'number' && tier.min_bags >= 1
          ? tier.min_bags
          : null
      const fromKg =
        bagSizeKg > 0 && typeof tier.min_quantity_kg === 'number'
          ? Math.round(tier.min_quantity_kg / bagSizeKg)
          : null
      const threshold = fromBags ?? fromKg
      if (threshold === null) continue
      if (threshold < 2 || threshold > safeTotalBags) continue
      out.push({
        bagThreshold: threshold,
        buyerPricePerUnit: toDisplayPricePerUnit(
          addPlatformFee(tier.price_per_kg),
          unit
        ),
      })
    }
    return out.sort((a, b) => a.bagThreshold - b.bagThreshold)
  }, [pricingTiers, bagSizeKg, safeTotalBags, unit])

  // Find the next tier the campaign hasn't unlocked yet. `bagsToNext` is the
  // CTA the buyer reads ("8 bags to next tier · pull a friend").
  const nextFlag = flags.find((f) => safeFilledBags < f.bagThreshold)
  const bagsToNext = nextFlag ? nextFlag.bagThreshold - safeFilledBags : 0

  // Active buyer-facing price per unit at the current bag count.
  const activeTierPricePerKg = (() => {
    let price = basePricePerKg
    const sortedAsc = [...pricingTiers].sort((a, b) => {
      const ab = a.min_bags ?? (a.min_quantity_kg ? a.min_quantity_kg / Math.max(1, bagSizeKg) : 0)
      const bb = b.min_bags ?? (b.min_quantity_kg ? b.min_quantity_kg / Math.max(1, bagSizeKg) : 0)
      return ab - bb
    })
    for (const t of sortedAsc) {
      const threshold =
        t.min_bags ??
        (bagSizeKg > 0 && typeof t.min_quantity_kg === 'number'
          ? Math.round(t.min_quantity_kg / bagSizeKg)
          : Number.POSITIVE_INFINITY)
      if (safeFilledBags >= threshold) price = t.price_per_kg
    }
    return price
  })()
  const activeBuyerPricePerUnit = toDisplayPricePerUnit(
    addPlatformFee(activeTierPricePerKg),
    unit
  )

  return (
    <section
      data-section="bag-grid"
      style={{
        background: 'var(--color-cream)',
        border: '4px solid var(--color-espresso)',
        borderRadius: 20,
        padding: '28px 32px 32px',
        boxShadow: '6px 6px 0 var(--color-espresso)',
      }}
    >
      {/* Header row — big bag count + total weight + bag-size pill */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 24,
          marginBottom: 22,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: '1 1 360px' }}>
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '.18em',
              textTransform: 'uppercase',
              color: 'var(--color-tomato)',
              marginBottom: 8,
            }}
          >
            Bag Progress
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 14,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(40px, 4.5vw, 64px)',
                lineHeight: 0.85,
                color: 'var(--color-espresso)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {safeFilledBags} / {safeTotalBags}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                color: 'var(--color-espresso)',
              }}
            >
              bags locked
            </span>
          </div>
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              color: 'var(--text-muted, #7a6a50)',
              marginTop: 8,
              fontWeight: 700,
            }}
          >
            {formatUnitWeight(committedKg, unit, 0)} {unit} pledged of{' '}
            {formatUnitWeight(totalKg, unit, 0)} {unit} · ${activeBuyerPricePerUnit.toFixed(2)}/{unit} locked in
          </div>
        </div>

        <div
          style={{
            background: 'var(--color-espresso)',
            border: '3px solid var(--color-espresso)',
            borderRadius: 9999,
            padding: '6px 14px',
            fontFamily: 'var(--font-body)',
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '.12em',
            textTransform: 'uppercase',
            color: 'var(--color-cream)',
            whiteSpace: 'nowrap',
          }}
        >
          {formatUnitWeight(bagSizeKg, unit, 1)} {unit} / bag
        </div>
      </div>

      {/* The grid itself */}
      <BagGrid
        totalBags={safeTotalBags}
        filledBags={safeFilledBags}
        inProgressPct={safeInProgressPct}
        flags={flags}
      />

      {/* Bottom CTA */}
      <div
        style={{
          marginTop: 22,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        {nextFlag ? (
          <div
            style={{
              background: 'var(--color-sun)',
              border: '3px solid var(--color-espresso)',
              borderRadius: 9999,
              padding: '8px 16px',
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              color: 'var(--color-espresso)',
              boxShadow: '3px 3px 0 var(--color-espresso)',
            }}
          >
            {bagsToNext} {bagsToNext === 1 ? 'bag' : 'bags'} to ${nextFlag.buyerPricePerUnit.toFixed(2)}/{unit} · pull a friend
          </div>
        ) : safeFilledBags >= safeTotalBags ? (
          <div
            style={{
              background: 'var(--color-matcha, #5A7A3A)',
              color: 'var(--color-cream)',
              border: '3px solid var(--color-espresso)',
              borderRadius: 9999,
              padding: '8px 16px',
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              boxShadow: '3px 3px 0 var(--color-espresso)',
            }}
          >
            Lot fully committed
          </div>
        ) : null}
        {children}
      </div>
    </section>
  )
}

// ─── grid ─────────────────────────────────────────────────────────────────────

function BagGrid({
  totalBags,
  filledBags,
  inProgressPct,
  flags,
}: {
  totalBags: number
  filledBags: number
  inProgressPct: number
  flags: TierFlag[]
}) {
  // The grid is a horizontal strip of cells, one per bag. Each cell renders
  // one of three states:
  //   filled    — solid tomato (this bag is fully pledged)
  //   filling   — striped tomato + cream (the open bag, partial fill)
  //   empty     — chalk (no pledges yet)
  // For lots with very high bag counts (>60), the cells get cramped, but the
  // grid still reads as a fill bar at a glance.
  const cells: Array<'filled' | 'filling' | 'empty'> = []
  for (let i = 0; i < totalBags; i++) {
    if (i < filledBags) cells.push('filled')
    else if (i === filledBags && inProgressPct > 0) cells.push('filling')
    else cells.push('empty')
  }

  // Flag positions: 1-indexed bag number → 0..1 position along the grid.
  // Position the flag above the boundary BEFORE bag N — e.g. a flag at bag
  // 20 sits over the seam between bag 19 and 20, reading as "complete bag
  // 19 to unlock". Cap at the right edge.
  const flagPosition = (bagNumber: number): number => {
    const idx = Math.max(0, Math.min(totalBags, bagNumber - 1))
    return totalBags === 0 ? 0 : idx / totalBags
  }

  return (
    <div style={{ position: 'relative', paddingTop: 56 }}>
      {/* Flag layer */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 48,
          pointerEvents: 'none',
        }}
      >
        {flags.map((flag) => {
          const pct = flagPosition(flag.bagThreshold) * 100
          return (
            <div
              key={flag.bagThreshold}
              style={{
                position: 'absolute',
                left: `${pct}%`,
                top: 0,
                transform: 'translateX(-50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 0,
              }}
            >
              <div
                style={{
                  background: 'var(--color-espresso)',
                  color: 'var(--color-sun)',
                  border: '2px solid var(--color-espresso)',
                  borderRadius: 8,
                  padding: '3px 8px',
                  fontFamily: 'var(--font-body)',
                  fontSize: 10.5,
                  fontWeight: 800,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                  boxShadow: '2px 2px 0 var(--color-tomato)',
                }}
              >
                ${flag.buyerPricePerUnit.toFixed(2)} @ {flag.bagThreshold} bags
              </div>
              {/* Down-pointing tick that lands on the seam */}
              <div
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: '5px solid transparent',
                  borderRight: '5px solid transparent',
                  borderTop: '8px solid var(--color-espresso)',
                }}
              />
            </div>
          )
        })}
      </div>

      {/* Cell row */}
      <div
        role="img"
        aria-label={`${filledBags} of ${totalBags} bags locked`}
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${totalBags}, minmax(0, 1fr))`,
          gap: 3,
          height: 56,
          border: '4px solid var(--color-espresso)',
          borderRadius: 14,
          padding: 4,
          background: 'var(--color-espresso)',
          boxShadow: '4px 4px 0 var(--color-espresso)',
        }}
      >
        {cells.map((state, i) => (
          <BagCell key={i} state={state} inProgressPct={inProgressPct} />
        ))}
      </div>
    </div>
  )
}

function BagCell({
  state,
  inProgressPct,
}: {
  state: 'filled' | 'filling' | 'empty'
  inProgressPct: number
}) {
  if (state === 'filled') {
    return (
      <div
        style={{
          background: 'var(--color-tomato)',
          borderRadius: 4,
        }}
      />
    )
  }
  if (state === 'filling') {
    return (
      <div
        style={{
          position: 'relative',
          background: 'var(--color-cream)',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            width: '100%',
            height: `${inProgressPct}%`,
            background: 'var(--color-tomato)',
            transition: 'height 220ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        />
      </div>
    )
  }
  return (
    <div
      style={{
        background: 'var(--color-cream)',
        borderRadius: 4,
        opacity: 0.55,
      }}
    />
  )
}

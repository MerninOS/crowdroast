'use client'

import * as React from 'react'
import { useUnitPreference } from '@/components/unit-provider'
import { formatUnitWeight, toDisplayPricePerUnit } from '@/lib/units'

export type CampaignTier = {
  id: string
  name: string
  /** Threshold as a percentage of the stretch goal (0 / 25 / 65 / 100). */
  threshold: number
  /** Per-kg price at this tier. Display layer converts via the unit toggle. */
  priceKg: number
}

interface TierLadderProps {
  tiers: CampaignTier[]
  /** Quantity committed so far, in kg. */
  committedKg: number
  /** Stretch goal in kg — the 100% mark on the bar. */
  stretchKg: number
  /** Visual energy: 'rowdy' wiggles the next-tier flag. */
  hype?: 'calm' | 'rowdy'
  /** Optional slot rendered below the ladder for a sticky invite poke. */
  children?: React.ReactNode
}

// Direct port of design/project/campaign/TierLadder.jsx — cream card with
// flag-chip progress, pulsing eyebrow, big display-font "X lb to Y."
// headline, animated tomato fill bar, and per-tier flag chips positioned
// proportionally. The next-tier flag wiggles when hype = 'rowdy'.
//
// Mobile responsiveness: the absolute-positioned chips along the bar
// would overlap each other below ~700px, so at that breakpoint the
// chips switch to a stacked 2-col grid below the bar (.cp-tier-flags-row
// hides; .cp-tier-flags-stack shows). The bar itself stays full-width.
export function TierLadder({
  tiers,
  committedKg,
  stretchKg,
  hype = 'rowdy',
  children,
}: TierLadderProps) {
  const { unit } = useUnitPreference()
  const kgAtTier = (t: CampaignTier) => (t.threshold / 100) * stretchKg
  const stretchPct = Math.min(
    100,
    Math.max(0, (committedKg / Math.max(0.0001, stretchKg)) * 100)
  )

  const currentTier =
    [...tiers].reverse().find((t) => committedKg >= kgAtTier(t)) ?? tiers[0]
  const nextTier =
    tiers.find((t) => kgAtTier(t) > committedKg) ?? tiers[tiers.length - 1]
  const kgToNext = Math.max(0, kgAtTier(nextTier) - committedKg)
  const nextIsStretch = nextTier.id === tiers[tiers.length - 1].id

  const formatQty = (kg: number) => formatUnitWeight(kg, unit, 0)
  const nextTierDisplayPrice = toDisplayPricePerUnit(nextTier.priceKg, unit)

  return (
    <div
      data-section="tier"
      className="cp-tier-card"
      style={{
        background: 'var(--color-cream)',
        border: '4px solid var(--color-espresso)',
        borderRadius: 20,
        padding: '28px 32px 32px',
        boxShadow: '6px 6px 0 var(--color-espresso)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 24,
          marginBottom: 24,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: '1 1 360px' }}>
          <div
            className="eyebrow"
            style={{
              color: 'var(--color-tomato)',
              marginBottom: 8,
              fontSize: 11,
              letterSpacing: '.18em',
              textTransform: 'uppercase',
              fontWeight: 800,
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: 999,
                background: 'var(--color-tomato)',
                marginRight: 8,
                animation: 'cp-pulse 1.4s ease-in-out infinite',
                verticalAlign: 'middle',
              }}
            />
            You&apos;re at {currentTier.name} · {Math.round(stretchPct)}%
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(36px, 4.6vw, 60px)',
              lineHeight: 0.9,
              textTransform: 'uppercase',
              color: 'var(--color-espresso)',
              margin: 0,
            }}
          >
            {kgToNext > 0 ? (
              <>
                {formatQty(kgToNext)} {unit}
                <br />
                to <span style={{ color: 'var(--color-tomato)' }}>{nextTier.name}.</span>
              </>
            ) : (
              <>
                {nextTier.name}{' '}
                <span style={{ color: 'var(--color-tomato)' }}>unlocked.</span>
              </>
            )}
          </h2>
          <p
            style={{
              fontSize: 14,
              color: 'var(--fg2)',
              marginTop: 10,
              marginBottom: 0,
              maxWidth: 480,
              lineHeight: 1.55,
            }}
          >
            {nextIsStretch ? (
              <>
                Hit it together and everyone pays{' '}
                <b style={{ color: 'var(--color-espresso)' }}>
                  ${nextTierDisplayPrice.toFixed(2)}/{unit}
                </b>{' '}
                — the lowest price on this lot.
              </>
            ) : (
              <>
                Next tier drops the price for{' '}
                <b style={{ color: 'var(--color-espresso)' }}>everyone in</b> to{' '}
                <b style={{ color: 'var(--color-espresso)' }}>
                  ${nextTierDisplayPrice.toFixed(2)}/{unit}
                </b>
                .
              </>
            )}
          </p>
        </div>

        <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          <PercentStarburst percent={Math.round(stretchPct)} />
        </div>
      </div>

      {/* Progress bar with tier flag chips */}
      <div className="cp-tier-bar-wrap">
        <div
          style={{
            position: 'relative',
            height: 18,
            background: 'var(--color-fog)',
            border: '3px solid var(--color-espresso)',
            borderRadius: 999,
            overflow: 'hidden',
          }}
        >
          <div
            data-testid="tier-progress-fill"
            style={{
              height: '100%',
              width: `${stretchPct}%`,
              background: 'var(--color-tomato)',
              transition: 'width .6s var(--ease-snap)',
            }}
          />
        </div>

        {/* Desktop: absolute-positioned chips along the bar */}
        <div className="cp-tier-flags-row">
          {tiers.map((t) => {
            const kgAt = kgAtTier(t)
            const left = Math.min(100, (kgAt / Math.max(0.0001, stretchKg)) * 100)
            const unlocked = committedKg >= kgAt
            const isNext = t.id === nextTier.id && !unlocked
            const transformX = left < 8 ? '0%' : left > 92 ? '-100%' : '-50%'
            return (
              <div
                key={t.id}
                style={{
                  position: 'absolute',
                  top: 'calc(100% - 84px)',
                  left: `${left}%`,
                  transform: `translateX(${transformX})`,
                  width: 120,
                }}
              >
                <FlagChip t={t} unlocked={unlocked} isNext={isNext} hype={hype} unit={unit} />
              </div>
            )
          })}
        </div>

        {/* Mobile: stacked 2-col grid under the bar */}
        <ul className="cp-tier-flags-stack">
          {tiers.map((t) => {
            const kgAt = kgAtTier(t)
            const unlocked = committedKg >= kgAt
            const isNext = t.id === nextTier.id && !unlocked
            return (
              <li key={t.id} style={{ listStyle: 'none' }}>
                <FlagChip t={t} unlocked={unlocked} isNext={isNext} hype={hype} unit={unit} />
              </li>
            )
          })}
        </ul>
      </div>

      {children}

      <style>{`
        .cp-tier-bar-wrap { position: relative; padding: 0 0 92px; }
        .cp-tier-flags-row { display: block; position: absolute; inset: 0; pointer-events: none; }
        .cp-tier-flags-row > div { pointer-events: auto; }
        .cp-tier-flags-stack { display: none; }

        @media (max-width: 700px) {
          .cp-tier-card { padding: 22px 18px 24px !important; }
          .cp-tier-bar-wrap { padding: 0 0 12px; }
          .cp-tier-flags-row { display: none; }
          .cp-tier-flags-stack {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            margin: 16px 0 0;
            padding: 0;
          }
        }

        @keyframes cp-pulse{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes cp-wiggle{0%,100%{transform:translateY(0) rotate(-1deg)}50%{transform:translateY(-3px) rotate(1.5deg)}}
        @keyframes cp-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
      `}</style>
    </div>
  )
}

// ─── Flag chip ────────────────────────────────────────────────────────────────
function FlagChip({
  t,
  unlocked,
  isNext,
  hype,
  unit,
}: {
  t: CampaignTier
  unlocked: boolean
  isNext: boolean
  hype: 'calm' | 'rowdy'
  unit: 'kg' | 'lb'
}) {
  const displayPrice = toDisplayPricePerUnit(t.priceKg, unit)
  return (
    <div
      style={{
        background: unlocked
          ? 'var(--color-matcha)'
          : isNext
            ? 'var(--color-sun)'
            : 'var(--color-chalk)',
        color: unlocked ? 'var(--color-cream)' : 'var(--color-espresso)',
        border: '3px solid var(--color-espresso)',
        borderRadius: 10,
        padding: '7px 8px 8px',
        textAlign: 'center',
        boxShadow: isNext
          ? '3px 3px 0 var(--color-tomato)'
          : '2px 2px 0 var(--color-espresso)',
        animation:
          isNext && hype === 'rowdy'
            ? 'cp-wiggle 2.4s ease-in-out infinite'
            : 'none',
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: '.1em',
          textTransform: 'uppercase',
          opacity: 0.75,
        }}
      >
        {unlocked ? '✓ Unlocked' : isNext ? 'Next' : 'Locked'}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 22,
          lineHeight: 1,
          marginTop: 3,
        }}
      >
        ${displayPrice.toFixed(2)}
      </div>
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          marginTop: 2,
          opacity: 0.85,
          textTransform: 'uppercase',
          letterSpacing: '.06em',
        }}
      >
        {t.name}
      </div>
    </div>
  )
}

// ─── Inline starburst (with percent label) ────────────────────────────────────
// The merninos Starburst exists but only takes a string label, not custom
// styling. Inlining the SVG path here matches the prototype exactly.
function PercentStarburst({ percent }: { percent: number }) {
  const points = burstPoints(24, 58, 44)
  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-flex',
        width: 96,
        height: 96,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg
        viewBox="0 0 120 120"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        aria-hidden
      >
        <polygon
          points={points}
          fill="var(--color-sun)"
          stroke="var(--color-espresso)"
          strokeWidth="3"
          strokeLinejoin="round"
        />
      </svg>
      <span
        style={{
          position: 'relative',
          zIndex: 2,
          color: 'var(--color-espresso)',
          fontFamily: 'var(--font-body)',
          fontWeight: 800,
          fontSize: 20,
          letterSpacing: '.04em',
          textTransform: 'uppercase',
          lineHeight: 1.05,
          textAlign: 'center',
          padding: '0 14%',
        }}
      >
        {percent}%
      </span>
    </div>
  )
}

function burstPoints(p: number, outerR: number, innerR: number, cx = 60, cy = 60) {
  const total = p * 2
  const out: string[] = []
  for (let i = 0; i < total; i++) {
    const r = i % 2 === 0 ? outerR : innerR
    const a = (Math.PI * 2 * i) / total - Math.PI / 2
    out.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`)
  }
  return out.join(' ')
}

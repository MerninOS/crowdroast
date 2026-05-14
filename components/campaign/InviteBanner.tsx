'use client'

import * as React from 'react'
import { useInviteData } from '@/hooks/use-invite-data'
import { useUnitPreference } from '@/components/unit-provider'
import { formatUnitWeight } from '@/lib/units'
import { REFERRAL_CREDIT_AMOUNT_CENTS } from '@/lib/referrals/settle-attribution'

interface InviteBannerProps {
  /** Quantity remaining to the next tier, in kg. Used for legacy weight-based lots. */
  kgToNext: number
  /**
   * Bags remaining to the next tier. Non-null for bag-aware lots, in which
   * case the headline switches to "X bags to drop the price".
   */
  bagsToNext?: number | null
  /** Name of the next tier — used in the headline/body. */
  nextTierName: string
  /** Whether the next tier is the stretch goal — flips body copy. */
  nextIsStretch: boolean
  onOpen: () => void
}

// Full-width invite banner — espresso card with tomato shadow, avatar
// stack with bobbing "YOU?" starburst, hub-local headline. Direct port of
// design/project/campaign/Invite.jsx (InviteBanner) with $25 → REFERRAL_CREDIT
// and hardcoded city/hub → useInviteData substitutions.
export function InviteBanner({
  kgToNext,
  bagsToNext,
  nextTierName,
  nextIsStretch,
  onOpen,
}: InviteBannerProps) {
  const { status, data } = useInviteData()
  const { unit } = useUnitPreference()
  if (status !== 'ready' || !data) return null

  const credit = REFERRAL_CREDIT_AMOUNT_CENTS / 100
  const city = data.hubCity ?? null
  const hubName = data.hubName
  const isBagAware = bagsToNext !== null && bagsToNext !== undefined
  const remaining = isBagAware ? bagsToNext! : kgToNext
  const remainingLabel = isBagAware
    ? `${remaining.toLocaleString()} bag${remaining === 1 ? '' : 's'}`
    : `${formatUnitWeight(kgToNext, unit, 0)} ${unit}`

  return (
    <div
      data-section="invite-banner"
      style={{
        background: 'var(--color-espresso)',
        color: 'var(--color-cream)',
        border: '5px solid var(--color-espresso)',
        borderRadius: 24,
        boxShadow: '8px 8px 0 var(--color-tomato)',
        padding: '28px 32px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: -30,
          right: -30,
          opacity: 0.18,
          fontSize: 240,
          lineHeight: 1,
          fontFamily: 'var(--font-display)',
          color: 'var(--color-tomato)',
          pointerEvents: 'none',
        }}
      >
        📍
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          flexWrap: 'wrap',
          position: 'relative',
        }}
      >
        {/* Avatar stack with bobbing "YOU?" starburst */}
        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          {(['tomato', 'honey', 'sun', 'sky'] as const).map((c, i) => (
            <div
              key={c}
              aria-hidden
              style={{
                width: 54,
                height: 54,
                borderRadius: 999,
                background: `var(--color-${c})`,
                border: '3.5px solid var(--color-cream)',
                marginLeft: i === 0 ? 0 : -18,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: c === 'tomato' ? 'var(--color-cream)' : 'var(--color-espresso)',
                fontFamily: 'var(--font-display)',
                fontSize: 22,
                zIndex: 4 - i,
              }}
            >
              ?
            </div>
          ))}
          <div className="cp-bob" style={{ marginLeft: -12, zIndex: 5 }}>
            <YouStarburst />
          </div>
          <style>{`
            @keyframes cp-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
            .cp-bob{animation:cp-bob 1.6s ease-in-out infinite}
          `}</style>
        </div>

        {/* Headline + body */}
        <div style={{ flex: '1 1 320px', minWidth: 280 }}>
          <div
            className="eyebrow"
            style={{
              color: 'var(--color-sun)',
              fontSize: 11,
              letterSpacing: '.18em',
              textTransform: 'uppercase',
              fontWeight: 800,
              marginBottom: 6,
            }}
          >
            <PinIcon />
            {hubName}
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(28px, 3.4vw, 44px)',
              lineHeight: 0.92,
              textTransform: 'uppercase',
              color: 'var(--color-cream)',
              margin: 0,
            }}
          >
            {remaining > 0 ? (
              <>
                Bring your{' '}
                {city && (
                  <>
                    <span style={{ color: 'var(--color-sun)' }}>{city}</span>{' '}
                  </>
                )}
                roast crew.
                <br />
                {remainingLabel} to drop the price.
              </>
            ) : nextIsStretch ? (
              <>
                Push for{' '}
                <span style={{ color: 'var(--color-sun)' }}>stretch</span>
                {city && (
                  <>
                    {' '}with your {city} crew
                  </>
                )}
                .
              </>
            ) : (
              <>
                {nextTierName}{' '}
                <span style={{ color: 'var(--color-sun)' }}>unlocked.</span>
                {city && <> Bring more from {city}.</>}
              </>
            )}
          </h2>
          <p
            style={{
              fontSize: 14,
              color: 'var(--color-cream)',
              opacity: 0.85,
              marginTop: 10,
              marginBottom: 0,
              maxWidth: 580,
              lineHeight: 1.55,
            }}
          >
            CrowdRoast pools demand by hub — only roasters who can pick up at{' '}
            <b style={{ color: 'var(--color-sun)' }}>{hubName}</b>
            {city && (
              <>
                {' '}in <b style={{ color: 'var(--color-sun)' }}>{city}</b>
              </>
            )}{' '}
            can join this lot. When they commit,{' '}
            <b style={{ color: 'var(--color-sun)' }}>
              you both get ${credit} in CrowdRoast credit.
            </b>
          </p>
        </div>

        {/* CTAs */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={onOpen}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              height: 46,
              padding: '0 28px',
              borderRadius: 9999,
              border: '2.5px solid var(--color-espresso)',
              background: 'var(--accent-2)',
              color: 'var(--accent-2-fg)',
              fontFamily: 'var(--font-body)',
              fontWeight: 800,
              fontSize: 14,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              boxShadow: '4px 4px 0 var(--color-cream)',
              whiteSpace: 'nowrap',
            }}
          >
            Invite{city ? ` ${city}` : ''} Roasters
            <ArrowIconCream />
          </button>
          <button
            type="button"
            onClick={onOpen}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-cream)',
              opacity: 0.75,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Or copy link →
          </button>
        </div>
      </div>
    </div>
  )
}

function YouStarburst() {
  const points = burstPoints(24, 58, 44)
  return (
    <div
      aria-hidden
      style={{
        position: 'relative',
        display: 'inline-flex',
        width: 64,
        height: 64,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg
        viewBox="0 0 120 120"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
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
          fontSize: 11,
          letterSpacing: '.04em',
          textTransform: 'uppercase',
          lineHeight: 1.05,
          textAlign: 'center',
        }}
      >
        YOU?
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

function PinIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ verticalAlign: '-1px', marginRight: 6 }}
      aria-hidden
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function ArrowIconCream() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

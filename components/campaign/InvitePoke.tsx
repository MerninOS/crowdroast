'use client'

import * as React from 'react'
import { useInviteData } from '@/hooks/use-invite-data'
import { REFERRAL_CREDIT_AMOUNT_CENTS } from '@/lib/referrals/settle-attribution'

interface InvitePokeProps {
  lbToNext: number
  onOpen: () => void
}

// Sun-yellow nudge button placed under the tier ladder. Direct port of
// design/project/campaign/Invite.jsx (InvitePoke). Returns null when the
// buyer has no hub or while invite data is loading — same render gate
// as every other CTA on the page.
export function InvitePoke({ lbToNext, onOpen }: InvitePokeProps) {
  const { status, data } = useInviteData()
  if (status !== 'ready' || !data) return null

  const credit = REFERRAL_CREDIT_AMOUNT_CENTS / 100
  const cityCopy = data.hubCity ? `local ${data.hubCity} roasters` : 'local roasters'

  return (
    <button
      type="button"
      onClick={onOpen}
      className="cp-poke"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        background: 'var(--color-sun)',
        border: '3px solid var(--color-espresso)',
        borderRadius: 14,
        padding: '12px 14px',
        boxShadow: '4px 4px 0 var(--color-espresso)',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all .15s var(--ease-snap)',
        fontFamily: 'var(--font-body)',
      }}
    >
      <div
        aria-hidden
        style={{
          width: 36,
          height: 36,
          borderRadius: 999,
          background: 'var(--color-tomato)',
          color: 'var(--color-cream)',
          border: '2.5px solid var(--color-espresso)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontSize: 18,
        }}
      >
        📍
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 18,
            lineHeight: 1,
            textTransform: 'uppercase',
            color: 'var(--color-espresso)',
          }}
        >
          {lbToNext > 0 ? `${lbToNext.toLocaleString()} lb to next tier` : 'Push the stretch goal'}
        </div>
        <div
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            color: 'var(--color-espresso)',
            opacity: 0.85,
            marginTop: 3,
          }}
        >
          Invite {cityCopy} · ${credit} credit each
        </div>
      </div>
      <ArrowIcon />
      <style>{`
        .cp-poke:hover{transform:translate(-2px,-2px);box-shadow:6px 6px 0 var(--color-espresso)}
      `}</style>
    </button>
  )
}

function ArrowIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-espresso)"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

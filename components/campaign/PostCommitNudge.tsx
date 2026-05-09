'use client'

import * as React from 'react'
import { useInviteData } from '@/hooks/use-invite-data'
import { REFERRAL_CREDIT_AMOUNT_CENTS } from '@/lib/referrals/settle-attribution'

interface PostCommitNudgeProps {
  visible: boolean
  onOpen: () => void
}

// Sun-yellow nudge that mounts inside the hero right column right after
// a successful commit. Direct port of the post-commit block in
// design/project/campaign/App.jsx, with hub-local copy from
// useInviteData and the credit amount from REFERRAL_CREDIT_AMOUNT_CENTS.
export function PostCommitNudge({ visible, onOpen }: PostCommitNudgeProps) {
  const { status, data } = useInviteData()
  if (!visible) return null
  if (status !== 'ready' || !data) return null

  const credit = REFERRAL_CREDIT_AMOUNT_CENTS / 100
  const cityLine = data.hubCity
    ? `Now bring your ${data.hubCity} crew.`
    : 'Now bring your crew.'

  return (
    <div
      style={{
        background: 'var(--color-sun)',
        border: '4px solid var(--color-espresso)',
        borderRadius: 18,
        padding: 18,
        boxShadow: '6px 6px 0 var(--color-espresso)',
        animation: 'cp-pop .4s var(--ease-bounce)',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 22,
          textTransform: 'uppercase',
          lineHeight: 1,
          marginBottom: 8,
          color: 'var(--color-espresso)',
        }}
      >
        You&apos;re in. {cityLine}
      </div>
      <div
        style={{
          fontSize: 13,
          color: 'var(--color-espresso)',
          opacity: 0.85,
          marginBottom: 12,
          lineHeight: 1.5,
        }}
      >
        Every {data.hubCity ?? 'local'} roaster you invite who commits = ${credit} credit
        for both of you. They pick up at {data.hubName} alongside you.
      </div>
      <button
        type="button"
        onClick={onOpen}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          height: 38,
          padding: '0 20px',
          borderRadius: 9999,
          border: '2.5px solid var(--color-espresso)',
          background: 'var(--color-espresso)',
          color: 'var(--color-cream)',
          fontFamily: 'var(--font-body)',
          fontWeight: 800,
          fontSize: 12.5,
          letterSpacing: '.08em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          boxShadow: '3px 3px 0 var(--color-espresso)',
          whiteSpace: 'nowrap',
        }}
      >
        Invite {data.hubCity ? `${data.hubCity} ` : ''}Roasters →
      </button>
      <style>{`
        @keyframes cp-pop{0%{opacity:0;transform:scale(.92) translateY(8px)}100%{opacity:1;transform:none}}
      `}</style>
    </div>
  )
}

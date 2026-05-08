'use client'

import * as React from 'react'
import { useInviteData } from '@/hooks/use-invite-data'
import { useIsDesktop } from '@/hooks/use-is-desktop'

interface InviteFabProps {
  onOpen: () => void
}

// Floating invite button anchored to bottom-left of the viewport on
// desktop only. Direct port of the inline FAB in
// design/project/campaign/App.jsx — no Fab primitive abstraction here
// because the design uses a bare button with hover transform.
//
// Two render gates: viewport must be >= 1024px (useIsDesktop) AND the
// buyer must have an active hub (useInviteData status === 'ready').
// Both are evaluated at the React level so the element is genuinely
// absent from the DOM, satisfying criterion #4's DOM-presence test.
export function InviteFab({ onOpen }: InviteFabProps) {
  const isDesktop = useIsDesktop()
  const { status, data } = useInviteData()

  if (!isDesktop) return null
  if (status !== 'ready' || !data) return null

  const cityLabel = data.hubCity ? `${data.hubCity} ` : ''

  return (
    <button
      type="button"
      onClick={onOpen}
      className="cp-fab"
      style={{
        position: 'fixed',
        left: 24,
        bottom: 24,
        zIndex: 30,
        background: 'var(--color-tomato)',
        color: 'var(--color-cream)',
        border: '4px solid var(--color-espresso)',
        borderRadius: 9999,
        padding: '14px 22px',
        boxShadow: '5px 5px 0 var(--color-espresso)',
        fontFamily: 'var(--font-body)',
        fontWeight: 800,
        fontSize: 12,
        letterSpacing: '.12em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        transition: 'all .15s var(--ease-snap)',
      }}
    >
      Invite {cityLabel}Roasters →
      <style>{`
        .cp-fab:hover{transform:translate(-2px,-2px);box-shadow:7px 7px 0 var(--color-espresso)}
      `}</style>
    </button>
  )
}

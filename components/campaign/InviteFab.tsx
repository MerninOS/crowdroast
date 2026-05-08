'use client'

import * as React from 'react'
import { Fab } from '@merninos/ui'
import { useInviteData } from '@/hooks/use-invite-data'
import { useIsDesktop } from '@/hooks/use-is-desktop'

interface InviteFabProps {
  onOpen: () => void
}

// Desktop-only floating invite button. Renders nothing on viewports < 1024px
// (via useIsDesktop returning false) AND nothing when the buyer has no hub.
// Both gates evaluate at the React level so the element is genuinely absent
// from the DOM, satisfying criterion #4's DOM-presence test.
export function InviteFab({ onOpen }: InviteFabProps) {
  const isDesktop = useIsDesktop()
  const { status } = useInviteData()

  if (!isDesktop) return null
  if (status !== 'ready') return null

  return (
    <Fab corner="bottom-left" tone="tomato" label="Invite" onClick={onOpen} />
  )
}

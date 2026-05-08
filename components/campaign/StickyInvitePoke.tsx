'use client'

import * as React from 'react'
import { StickyCta } from '@merninos/ui'
import { useInviteData } from '@/hooks/use-invite-data'

interface StickyInvitePokeProps {
  onOpen: () => void
}

// Sticky CTA pinned inside the tier-progress section. Returns null when
// the buyer has no hub (no-hub status) or when the fetch is still resolving
// — never renders independently and never fetches its own data.
export function StickyInvitePoke({ onOpen }: StickyInvitePokeProps) {
  const { status, data } = useInviteData()

  if (status !== 'ready') return null

  const helper = data?.hubCity
    ? `Earn $10 each — ${data.hubCity} crew`
    : 'Earn $10 each'

  return (
    <StickyCta label="Invite a roaster" helper={helper} onClick={onOpen} />
  )
}

'use client'

import * as React from 'react'
import { BannerCta, Button } from '@merninos/ui'
import { useInviteData } from '@/hooks/use-invite-data'
import { REFERRAL_CREDIT_AMOUNT_CENTS } from '@/lib/referrals/settle-attribution'

interface InviteBannerProps {
  onOpen: () => void
}

// Full-width tomato banner placed between the tier section and the social
// proof section. Hub-local copy when hubCity is known; gracefully drops
// the city when null. Returns null on no-hub / loading / error.
export function InviteBanner({ onOpen }: InviteBannerProps) {
  const { status, data } = useInviteData()

  if (status !== 'ready' || !data) return null

  const creditDollars = REFERRAL_CREDIT_AMOUNT_CENTS / 100
  const title = data.hubCity
    ? `Bring your ${data.hubCity} roast crew`
    : 'Bring your roast crew'
  const body = data.hubCity
    ? `This lot ships once to ${data.hubName}. Bring a roaster from your city — you each earn $${creditDollars} in credits when they join the buy.`
    : `This lot ships once to ${data.hubName}. Bring a roaster — you each earn $${creditDollars} in credits when they join the buy.`

  return (
    <div data-section="invite-banner">
      <BannerCta
        tone="tomato"
        eyebrow="Bring your crew"
        title={title}
        body={body}
        cta={
          <Button onClick={onOpen} variant="secondary">
            Invite a roaster
          </Button>
        }
      />
    </div>
  )
}

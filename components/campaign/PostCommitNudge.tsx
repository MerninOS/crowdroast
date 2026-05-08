'use client'

import * as React from 'react'
import { Card, Button } from '@merninos/ui'
import { useInviteData } from '@/hooks/use-invite-data'

interface PostCommitNudgeProps {
  visible: boolean
  onOpen: () => void
}

// Sun-yellow nudge that mounts after a successful commit. Three render
// gates: visible prop is true (parent flips it on commit success), buyer
// has invite data ready, and the no-hub case still hides it. Failed
// commits never set visible=true upstream so this stays absent.
export function PostCommitNudge({ visible, onOpen }: PostCommitNudgeProps) {
  const { status, data } = useInviteData()

  if (!visible) return null
  if (status !== 'ready' || !data) return null

  const subline = data.hubCity
    ? `Now bring a friend from ${data.hubCity}.`
    : 'Now bring a friend.'

  return (
    <Card className="flex flex-col items-start gap-3 p-6 bg-sun border-[4px]">
      <span className="font-body text-xs font-bold uppercase tracking-[0.12em] text-espresso/70">
        You&apos;re in
      </span>
      <h3 className="font-headline text-3xl text-espresso leading-tight">
        {subline}
      </h3>
      <p className="font-body text-sm text-espresso/80">
        Your link earns you $10 in credits each time a roaster from {data.hubName} joins this lot.
      </p>
      <Button onClick={onOpen} variant="default">
        Invite a roaster
      </Button>
    </Card>
  )
}

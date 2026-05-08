'use client'

import * as React from 'react'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
  Button,
} from '@merninos/ui'
import { useInviteData } from '@/hooks/use-invite-data'
import { REFERRAL_CREDIT_AMOUNT_CENTS } from '@/lib/referrals/settle-attribution'

interface InviteModalProps {
  open: boolean
  onOpenChange: (next: boolean) => void
}

// Invite share modal mounted at the orchestrator root and controlled by
// shared open state. Reads from useInviteData() — never fetches its own —
// so the four CTAs that open it all share the same one-time fetch.
//
// Three sub-stages were planned (shell / share controls / $10 footer +
// error) but they're so tightly coupled they live in one component.
export function InviteModal({ open, onOpenChange }: InviteModalProps) {
  const { status, data } = useInviteData()
  const [copied, setCopied] = React.useState(false)
  const creditDollars = REFERRAL_CREDIT_AMOUNT_CENTS / 100

  // Reset the copy state every time the modal opens so the button label
  // doesn't lie ("Copied!") on a re-open after a successful copy.
  React.useEffect(() => {
    if (open) setCopied(false)
  }, [open])

  const referralUrl = data?.url ?? ''
  const suggestedMessage = data
    ? buildSuggestedMessage(data.hubName, data.hubCity, referralUrl, creditDollars)
    : ''

  async function handleCopy() {
    if (!referralUrl) return
    try {
      await navigator.clipboard.writeText(referralUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard write blocked (some iframes / older browsers). Stay
      // silent — never flip to a false "Copied!" state.
      setCopied(false)
    }
  }

  const slackHref = data
    ? `https://slack.com/?text=${encodeURIComponent(suggestedMessage)}`
    : '#'
  const xHref = data
    ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(suggestedMessage)}`
    : '#'
  const smsHref = data ? `sms:?&body=${encodeURIComponent(suggestedMessage)}` : '#'

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent side="right" className="flex h-full w-full max-w-md flex-col bg-cream">
        <DrawerHeader>
          <DrawerTitle className="font-headline text-3xl text-espresso">
            Invite a roaster
          </DrawerTitle>
          {data && (
            <DrawerDescription className="font-body text-sm text-espresso/70">
              Earn $${creditDollars} in credits per friend who joins.
            </DrawerDescription>
          )}
        </DrawerHeader>

        {status === 'error' ? (
          <DrawerBody>
            <div className="rounded-[16px] border-[3px] border-espresso bg-tomato p-6 text-cream">
              <p className="font-headline text-2xl leading-tight">
                Something went sideways.
              </p>
              <p className="font-body text-sm mt-2">
                Refresh and try again.
              </p>
            </div>
          </DrawerBody>
        ) : status === 'loading' || !data ? (
          <DrawerBody>
            <p className="font-body text-sm text-espresso/70">Brewing your link…</p>
          </DrawerBody>
        ) : (
          <DrawerBody className="flex flex-col gap-6">
            <div className="rounded-[16px] border-[3px] border-espresso bg-sun p-4">
              <p className="font-body text-sm text-espresso">
                CrowdRoast is hub-local. This lot ships once to{' '}
                <strong className="font-bold">{data.hubName}</strong>
                {data.hubCity ? (
                  <>
                    {' '}in <strong className="font-bold">{data.hubCity}</strong>
                  </>
                ) : null}
                . Roasters pick it up from there.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <label
                htmlFor="invite-link"
                className="font-body text-xs font-bold uppercase tracking-[0.12em] text-espresso/60"
              >
                Your referral link
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="invite-link"
                  readOnly
                  value={referralUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 rounded-[12px] border-[3px] border-espresso bg-chalk px-4 py-3 font-mono text-sm text-espresso shadow-flat-sm focus:outline-none focus:shadow-flat-md"
                />
                <Button
                  type="button"
                  onClick={handleCopy}
                  variant={copied ? 'matcha' : 'default'}
                >
                  {copied ? 'Copied!' : 'Copy link'}
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <span className="font-body text-xs font-bold uppercase tracking-[0.12em] text-espresso/60">
                Suggested message
              </span>
              <p className="rounded-[12px] border-[2px] border-espresso/20 bg-chalk p-3 font-body text-sm text-espresso whitespace-pre-line">
                {suggestedMessage}
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <span className="font-body text-xs font-bold uppercase tracking-[0.12em] text-espresso/60">
                Quick share
              </span>
              <div className="flex flex-wrap gap-3">
                <Button asChild variant="outline">
                  <a href={slackHref} target="_blank" rel="noreferrer">
                    Slack
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <a href={xHref} target="_blank" rel="noreferrer">
                    X
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <a href={smsHref}>iMessage</a>
                </Button>
              </div>
            </div>
          </DrawerBody>
        )}

        <DrawerFooter className="border-t-[2px] border-espresso/15 bg-cream">
          <p className="font-body text-xs font-bold uppercase tracking-[0.1em] text-espresso/70 text-center w-full">
            ✦ Earn ${creditDollars} in credits per friend who joins ✦
          </p>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

function buildSuggestedMessage(
  hubName: string,
  hubCity: string | null,
  url: string,
  creditDollars: number
): string {
  const place = hubCity ? `${hubName} in ${hubCity}` : hubName
  return `Joining a coffee buy at ${place} — want in? You get $${creditDollars} in credits when you sign up: ${url}`
}

'use client'

import * as React from 'react'
import { useInviteData } from '@/hooks/use-invite-data'
import { REFERRAL_CREDIT_AMOUNT_CENTS } from '@/lib/referrals/settle-attribution'

interface InviteModalProps {
  open: boolean
  onClose: () => void
  /** Lot context used in the suggested message (lot id, country, name). */
  lotId: string
  lotCountry: string
  lotName: string
}

// Direct port of design/project/campaign/Invite.jsx (InviteModal). Cream
// dialog with tomato shadow, tomato header band, sun hub-explainer band,
// referral input + copy, suggested message, three share buttons, and a
// pinned credit footer. Hub/city/credit values come from real data —
// useInviteData and REFERRAL_CREDIT_AMOUNT_CENTS — rather than the
// prototype's placeholder constants.
//
// Esc-to-close + initial focus implemented locally because we're not
// using a Radix Dialog wrapper here (the prototype uses a bare overlay).
export function InviteModal({
  open,
  onClose,
  lotId,
  lotCountry,
  lotName,
}: InviteModalProps) {
  const { status, data } = useInviteData()
  const [copied, setCopied] = React.useState(false)
  const closeBtnRef = React.useRef<HTMLButtonElement>(null)

  // Reset copy state on each open.
  React.useEffect(() => {
    if (open) setCopied(false)
  }, [open])

  // Esc to close + focus management.
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    closeBtnRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const credit = REFERRAL_CREDIT_AMOUNT_CENTS / 100
  const city = data?.hubCity ?? null
  const hubName = data?.hubName ?? 'your hub'
  const inviteUrl = data?.url ?? ''
  const message = `Hey I'm going in on some (${lotCountry} ${lotName}) green coffee on CrowdRoast. It's pooling through ${hubName}${city ? ` in ${city}` : ''}. A few more local roasters and the price drops for everyone. Want in?`

  const handleCopy = async () => {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(28,15,5,.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        animation: 'cp-fade .2s ease-out',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-modal-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--color-cream)',
          border: '5px solid var(--color-espresso)',
          borderRadius: 24,
          boxShadow: '10px 10px 0 var(--color-tomato)',
          width: '100%',
          maxWidth: 580,
          maxHeight: '90vh',
          overflow: 'auto',
          animation: 'cp-pop .28s var(--ease-bounce)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '22px 26px',
            borderBottom: '4px solid var(--color-espresso)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            background: 'var(--color-tomato)',
            color: 'var(--color-cream)',
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '.18em',
                textTransform: 'uppercase',
                opacity: 0.85,
              }}
            >
              <PinIcon />
              Invite{city ? ` local ${city} roasters` : ' local roasters'}
            </div>
            <div
              id="invite-modal-title"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 30,
                lineHeight: 0.95,
                textTransform: 'uppercase',
                marginTop: 4,
              }}
            >
              {city ? (
                <>
                  Bring your {city}
                  <br />
                  crew. Drop the price.
                </>
              ) : (
                'Bring your crew. Drop the price.'
              )}
            </div>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close invite modal"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-cream)',
              cursor: 'pointer',
              padding: 4,
              opacity: 0.85,
            }}
          >
            <XIcon />
          </button>
        </div>

        {/* Hub explainer band */}
        <div
          style={{
            background: 'var(--color-sun)',
            borderBottom: '4px solid var(--color-espresso)',
            padding: '14px 26px',
            display: 'flex',
            gap: 14,
            alignItems: 'center',
          }}
        >
          <div aria-hidden style={{ fontSize: 24 }}>📍</div>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 700,
              color: 'var(--color-espresso)',
              lineHeight: 1.45,
            }}
          >
            CrowdRoast is <b>hub-local</b>. This lot ships once to{' '}
            <b>{hubName}</b>
            {city ? (
              <>
                {' '}and roasters pick up there in <b>{city}</b>.
              </>
            ) : (
              <>.</>
            )}{' '}
            Only invite roasters who can grab their bags from the dock.
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '22px 26px' }}>
          {status === 'error' ? (
            <div
              style={{
                background: 'var(--color-tomato)',
                color: 'var(--color-cream)',
                border: '3px solid var(--color-espresso)',
                borderRadius: 12,
                padding: 14,
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              Something went sideways. Refresh and try again.
            </div>
          ) : status === 'loading' || !data ? (
            <p style={{ fontSize: 13, color: 'var(--fg2)' }}>
              Brewing your link…
            </p>
          ) : (
            <>
              <Label>Your referral link</Label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
                <input
                  readOnly
                  value={inviteUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Referral link"
                  style={{
                    flex: 1,
                    padding: '12px 14px',
                    border: '3px solid var(--color-espresso)',
                    borderRadius: 12,
                    background: 'var(--color-chalk)',
                    color: 'var(--color-espresso)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12.5,
                    fontWeight: 600,
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    height: 42,
                    padding: '0 20px',
                    borderRadius: 9999,
                    border: '2.5px solid var(--color-espresso)',
                    background: copied
                      ? 'var(--accent-positive)'
                      : 'var(--accent-1)',
                    color: copied
                      ? 'var(--accent-positive-fg)'
                      : 'var(--accent-1-fg)',
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
                  {copied ? (
                    <>
                      <CheckIcon /> Copied
                    </>
                  ) : (
                    'Copy'
                  )}
                </button>
              </div>

              <Label>Suggested message</Label>
              <div
                style={{
                  background: 'var(--color-chalk)',
                  border: '3px solid var(--color-espresso)',
                  borderRadius: 12,
                  padding: 14,
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: 'var(--color-espresso)',
                  fontStyle: 'italic',
                }}
              >
                &ldquo;{message}&rdquo;
              </div>

              <div
                style={{
                  marginTop: 14,
                  fontSize: 11.5,
                  fontWeight: 700,
                  color: 'var(--fg2)',
                  lineHeight: 1.5,
                  display: 'flex',
                  gap: 6,
                  alignItems: 'flex-start',
                }}
              >
                <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>💡</span>
                <span>
                  Best places to share: your local roaster Slack,
                  {city ? ` the ${city} barista group chat,` : ''} or DM specific roasters you know who buy specialty.
                </span>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                <ShareLink
                  href={`https://slack.com/?text=${encodeURIComponent(message + ' ' + inviteUrl)}`}
                  ariaLabel="Share invite via Slack"
                >
                  Share to Slack
                </ShareLink>
                <ShareLink
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(message + ' ' + inviteUrl)}`}
                  ariaLabel="Share invite on X (formerly Twitter)"
                >
                  Share to X
                </ShareLink>
                <ShareLink
                  href={`sms:?&body=${encodeURIComponent(message + ' ' + inviteUrl)}`}
                  ariaLabel="Share invite via iMessage"
                >
                  Send via iMessage
                </ShareLink>
              </div>

              <div
                style={{
                  background: 'var(--color-sun)',
                  border: '3px solid var(--color-espresso)',
                  borderRadius: 12,
                  padding: '12px 14px',
                  marginTop: 18,
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                }}
              >
                <div aria-hidden style={{ fontSize: 24 }}>🤝</div>
                <div
                  style={{
                    flex: 1,
                    fontSize: 12.5,
                    fontWeight: 700,
                    lineHeight: 1.4,
                    color: 'var(--color-espresso)',
                  }}
                >
                  <b>${credit} credit</b> for every{' '}
                  {city ? `${city} ` : ''}roaster who commits via your link —
                  auto-applied when the campaign closes.
                </div>
              </div>

              {/* sr-only live region for clipboard success */}
              <div
                role="status"
                aria-live="polite"
                style={{
                  position: 'absolute',
                  width: 1,
                  height: 1,
                  padding: 0,
                  margin: -1,
                  overflow: 'hidden',
                  clip: 'rect(0, 0, 0, 0)',
                  whiteSpace: 'nowrap',
                  border: 0,
                }}
              >
                {copied ? 'Link copied to clipboard.' : ''}
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes cp-fade{from{opacity:0}to{opacity:1}}
        @keyframes cp-pop{0%{opacity:0;transform:scale(.92) translateY(8px)}100%{opacity:1;transform:none}}
      `}</style>
    </div>
  )
}

// ─── tiny inline atoms ────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="label"
      style={{
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: '.12em',
        textTransform: 'uppercase',
        marginBottom: 8,
        color: 'var(--color-espresso)',
      }}
    >
      {children}
    </div>
  )
}

function ShareLink({
  href,
  ariaLabel,
  children,
}: {
  href: string
  ariaLabel: string
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={ariaLabel}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 30,
        padding: '0 14px',
        borderRadius: 9999,
        border: '2.5px solid var(--color-espresso)',
        background: 'var(--surface-card)',
        color: 'var(--color-espresso)',
        fontFamily: 'var(--font-body)',
        fontWeight: 800,
        fontSize: 11,
        letterSpacing: '.08em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        boxShadow: '3px 3px 0 var(--color-espresso)',
        whiteSpace: 'nowrap',
        textDecoration: 'none',
      }}
    >
      {children}
    </a>
  )
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

function XIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

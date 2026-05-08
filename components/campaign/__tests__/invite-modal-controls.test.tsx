// @vitest-environment jsdom

/**
 * Criterion 7 — Modal $10 credit + share controls.
 *
 * The invite modal renders Slack/X/iMessage buttons + a copy-link control,
 * with the credit amount derived from REFERRAL_CREDIT_AMOUNT_CENTS — never
 * a hard-coded literal. Clipboard rejection does NOT flip the button to
 * a false "Copied!" state.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { InviteDataProvider } from '@/hooks/use-invite-data'
import { InviteModal } from '@/components/campaign/InviteModal'
import { installInviteFetchMock } from './test-helpers'
import { REFERRAL_CREDIT_AMOUNT_CENTS } from '@/lib/referrals/settle-attribution'

const dollar = REFERRAL_CREDIT_AMOUNT_CENTS / 100

describe('InviteModal (criterion 7)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the credit amount derived from REFERRAL_CREDIT_AMOUNT_CENTS', async () => {
    installInviteFetchMock({ kind: 'ready' })
    render(
      <InviteDataProvider>
        <InviteModal open={true} onOpenChange={() => {}} />
      </InviteDataProvider>
    )
    await waitFor(() =>
      expect(
        screen.getByText(new RegExp(`\\$${dollar}\\b.+credits`, 'i'))
      ).toBeInTheDocument()
    )
  })

  it('exposes Slack, X, iMessage, and Copy controls', async () => {
    installInviteFetchMock({ kind: 'ready' })
    render(
      <InviteDataProvider>
        <InviteModal open={true} onOpenChange={() => {}} />
      </InviteDataProvider>
    )
    await waitFor(() => screen.getByRole('link', { name: /slack/i }))
    expect(screen.getByRole('link', { name: /^slack$/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^x$/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^imessage$/i })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^copy link$/i })
    ).toBeInTheDocument()
  })

  it('does NOT flip to "Copied!" when the clipboard write throws', async () => {
    installInviteFetchMock({ kind: 'ready' })
    // Replace navigator.clipboard.writeText with a throwing impl
    const originalClipboard = (global.navigator as any).clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('blocked')),
      },
    })

    render(
      <InviteDataProvider>
        <InviteModal open={true} onOpenChange={() => {}} />
      </InviteDataProvider>
    )
    const copyBtn = await waitFor(() =>
      screen.getByRole('button', { name: /^copy link$/i })
    )
    fireEvent.click(copyBtn)
    // Wait one microtask for the rejection to settle, then assert no flip.
    await new Promise((r) => setTimeout(r, 10))
    expect(
      screen.queryByRole('button', { name: /^copied!$/i })
    ).not.toBeInTheDocument()

    Object.assign(navigator, { clipboard: originalClipboard })
  })

  it('shows an error state when invite-data status is error', async () => {
    installInviteFetchMock({ kind: 'error' })
    render(
      <InviteDataProvider>
        <InviteModal open={true} onOpenChange={() => {}} />
      </InviteDataProvider>
    )
    await waitFor(() =>
      expect(screen.getByText(/something went sideways/i)).toBeInTheDocument()
    )
  })
})

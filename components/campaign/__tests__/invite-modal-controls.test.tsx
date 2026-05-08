// @vitest-environment jsdom

/**
 * Criterion 7 — Modal credit + share controls.
 *
 * The redesigned InviteModal renders a copy-link control + three share
 * buttons (Slack / X / iMessage) + a pinned credit footer. The credit
 * amount is derived from REFERRAL_CREDIT_AMOUNT_CENTS — never literal.
 * Clipboard rejection silently no-ops (does not flip to a false
 * "Copied!" state).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { InviteDataProvider } from '@/hooks/use-invite-data'
import { InviteModal } from '@/components/campaign/InviteModal'
import { installInviteFetchMock } from './test-helpers'
import { REFERRAL_CREDIT_AMOUNT_CENTS } from '@/lib/referrals/settle-attribution'

const dollar = REFERRAL_CREDIT_AMOUNT_CENTS / 100

const baseProps = {
  open: true,
  onClose: () => {},
  lotId: 'lot-abc12345',
  lotCountry: 'Ethiopia',
  lotName: 'Yirgacheffe Natural',
}

describe('InviteModal (criterion 7)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the credit amount derived from REFERRAL_CREDIT_AMOUNT_CENTS', async () => {
    installInviteFetchMock({ kind: 'ready' })
    render(
      <InviteDataProvider>
        <InviteModal {...baseProps} />
      </InviteDataProvider>
    )
    await waitFor(() =>
      expect(
        screen.getByText(new RegExp(`\\$${dollar}\\s*credit`, 'i'))
      ).toBeInTheDocument()
    )
  })

  it('exposes Share to Slack/X/iMessage links and a Copy button', async () => {
    installInviteFetchMock({ kind: 'ready' })
    render(
      <InviteDataProvider>
        <InviteModal {...baseProps} />
      </InviteDataProvider>
    )
    await waitFor(() => screen.getByRole('link', { name: /slack/i }))
    expect(
      screen.getByRole('link', { name: /share invite via slack/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /share invite on x/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /share invite via imessage/i })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^copy$/i })).toBeInTheDocument()
  })

  it('does NOT flip to "Copied" when the clipboard write throws', async () => {
    installInviteFetchMock({ kind: 'ready' })
    const originalClipboard = (global.navigator as any).clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('blocked')),
      },
    })

    render(
      <InviteDataProvider>
        <InviteModal {...baseProps} />
      </InviteDataProvider>
    )
    const copyBtn = await waitFor(() =>
      screen.getByRole('button', { name: /^copy$/i })
    )
    fireEvent.click(copyBtn)
    await new Promise((r) => setTimeout(r, 10))
    expect(
      screen.queryByRole('button', { name: /^copied$/i })
    ).not.toBeInTheDocument()

    Object.assign(navigator, { clipboard: originalClipboard })
  })

  it('shows an error state when invite-data status is error', async () => {
    installInviteFetchMock({ kind: 'error' })
    render(
      <InviteDataProvider>
        <InviteModal {...baseProps} />
      </InviteDataProvider>
    )
    await waitFor(() =>
      expect(screen.getByText(/something went sideways/i)).toBeInTheDocument()
    )
  })
})

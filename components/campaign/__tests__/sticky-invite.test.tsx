// @vitest-environment jsdom

/**
 * Criterion 2 — Sticky invite poke.
 *
 * The redesigned InvitePoke is the sun-yellow nudge nested under the
 * tier ladder. The "stickiness" is provided by its parent — TierLadder
 * gives the invite poke scroll runway via min-height. We assert here
 * that the button renders when invite data is ready and is absent
 * (DOM-empty) when the buyer has no hub.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { InvitePoke } from '@/components/campaign/InvitePoke'
import { InviteDataProvider } from '@/hooks/use-invite-data'
import { installInviteFetchMock } from './test-helpers'

describe('InvitePoke (criterion 2)', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      window.matchMedia = ((query: string) =>
        ({
          matches: false,
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        } as MediaQueryList)) as typeof window.matchMedia
    }
  })

  it('renders the poke when invite data is ready', async () => {
    installInviteFetchMock({ kind: 'ready', hubCity: 'Austin' })
    render(
      <InviteDataProvider>
        <InvitePoke lbToNext={150} onOpen={() => {}} />
      </InviteDataProvider>
    )
    await waitFor(() =>
      expect(screen.getByText(/150 lb to next tier/i)).toBeInTheDocument()
    )
    expect(screen.getByText(/local austin roasters/i)).toBeInTheDocument()
  })

  it('does NOT render when buyer has no hub (403)', async () => {
    installInviteFetchMock({ kind: 'no-hub' })
    const { container } = render(
      <InviteDataProvider>
        <InvitePoke lbToNext={150} onOpen={() => {}} />
      </InviteDataProvider>
    )
    await waitFor(() => expect(container.firstChild).toBeNull())
  })

  it('does NOT render while loading', () => {
    installInviteFetchMock({ kind: 'loading' })
    const { container } = render(
      <InviteDataProvider>
        <InvitePoke lbToNext={150} onOpen={() => {}} />
      </InviteDataProvider>
    )
    expect(container.firstChild).toBeNull()
  })
})

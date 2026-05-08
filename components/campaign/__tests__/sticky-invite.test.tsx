// @vitest-environment jsdom

/**
 * Criterion 2 — Sticky invite in tier section.
 *
 * Given a buyer viewing the campaign page, the sticky CTA will be visible
 * inside the tier section while it's in the viewport, and absent from the
 * DOM when the buyer has no hub.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { StickyInvitePoke } from '@/components/campaign/StickyInvitePoke'
import { InviteDataProvider } from '@/hooks/use-invite-data'
import { installInviteFetchMock } from './test-helpers'

function noop() {}

describe('StickyInvitePoke (criterion 2)', () => {
  beforeEach(() => {
    // Reset matchMedia stub from setup file each run
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

  it('renders the sticky CTA with sticky class when invite data is ready', async () => {
    installInviteFetchMock({ kind: 'ready' })
    render(
      <InviteDataProvider>
        <StickyInvitePoke onOpen={noop} />
      </InviteDataProvider>
    )

    const button = await waitFor(() =>
      screen.getByRole('button', { name: /invite a roaster/i })
    )
    // The merninos StickyCta applies `sticky` (Tailwind utility for
    // position: sticky) directly. We assert the class as the testable
    // proxy for computed position — JSDOM doesn't apply utility CSS.
    expect(button.className).toMatch(/\bsticky\b/)
  })

  it('does NOT render when the buyer has no active hub (403)', async () => {
    installInviteFetchMock({ kind: 'no-hub' })
    const { container } = render(
      <InviteDataProvider>
        <StickyInvitePoke onOpen={noop} />
      </InviteDataProvider>
    )

    // Wait for fetch to resolve and the provider to settle.
    await waitFor(() => {
      expect(container.firstChild).toBeNull()
    })
    expect(screen.queryByRole('button', { name: /invite a roaster/i })).toBeNull()
  })

  it('does NOT render while invite data is still loading', () => {
    installInviteFetchMock({ kind: 'loading' })
    const { container } = render(
      <InviteDataProvider>
        <StickyInvitePoke onOpen={noop} />
      </InviteDataProvider>
    )
    expect(container.firstChild).toBeNull()
  })
})

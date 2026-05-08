// @vitest-environment jsdom

/**
 * Criterion 4 — FAB desktop only.
 *
 * Desktop (viewport >= 1024px): FAB renders, position is fixed.
 * Mobile (viewport < 1024px): FAB is absent from DOM (not just hidden).
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { InviteDataProvider } from '@/hooks/use-invite-data'
import { InviteFab } from '@/components/campaign/InviteFab'
import { installInviteFetchMock, setViewportIsDesktop } from './test-helpers'

describe('InviteFab (criterion 4)', () => {
  beforeEach(() => {
    setViewportIsDesktop(false)
  })

  it('renders on desktop with inline position: fixed when invite is ready', async () => {
    setViewportIsDesktop(true)
    installInviteFetchMock({ kind: 'ready' })
    render(
      <InviteDataProvider>
        <InviteFab onOpen={() => {}} />
      </InviteDataProvider>
    )
    const button = await waitFor(() =>
      screen.getByRole('button', { name: /invite/i })
    )
    // The FAB uses inline styles per the prototype — assert the
    // computed inline position is "fixed", not a class.
    expect(button.style.position).toBe('fixed')
  })

  it('is ABSENT FROM THE DOM on mobile viewports (not just display:none)', async () => {
    setViewportIsDesktop(false)
    installInviteFetchMock({ kind: 'ready' })
    const { container } = render(
      <InviteDataProvider>
        <InviteFab onOpen={() => {}} />
      </InviteDataProvider>
    )
    await waitFor(() => {
      expect(container.firstChild).toBeNull()
    })
    expect(screen.queryByRole('button', { name: /invite/i })).toBeNull()
  })

  it('is absent on desktop when buyer has no hub (403)', async () => {
    setViewportIsDesktop(true)
    installInviteFetchMock({ kind: 'no-hub' })
    const { container } = render(
      <InviteDataProvider>
        <InviteFab onOpen={() => {}} />
      </InviteDataProvider>
    )
    await waitFor(() => expect(container.firstChild).toBeNull())
  })
})

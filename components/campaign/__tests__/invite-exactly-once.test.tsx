// @vitest-environment jsdom

/**
 * Criterion 6 — Invite click → modal + existing API call (exactly once).
 *
 * Across the entire page lifecycle and any number of CTA clicks, the
 * underlying POST /api/invite-codes call fires exactly ONCE. This is the
 * load-bearing guarantee that makes the four placements share a backend
 * instead of each one re-fetching.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import {
  installInviteFetchMock,
  renderCampaignPage,
  setViewportIsDesktop,
} from './test-helpers'

vi.mock('@/components/commitment-form', () => ({
  CommitmentForm: ({ onSuccess }: { onSuccess?: () => void }) => (
    <button data-testid="commitment-form" onClick={() => onSuccess?.()}>
      Commit
    </button>
  ),
}))

vi.mock('@/components/unit-provider', () => ({
  useUnitPreference: () => ({ unit: 'lb' }),
}))

vi.mock('next/image', () => ({
  default: ({ src, alt, ...rest }: any) => {
    const { fill, sizes, priority, ...imgProps } = rest
    return <img src={src} alt={alt} {...imgProps} />
  },
}))

describe('CampaignPage — exactly-once invite API call (criterion 6)', () => {
  beforeEach(() => {
    setViewportIsDesktop(true)
    vi.clearAllMocks()
  })

  it('hits POST /api/invite-codes exactly ONCE across multiple CTA interactions', async () => {
    const fetchMock = installInviteFetchMock({ kind: 'ready' })
    await renderCampaignPage()

    // Wait for the provider's mount-time fetch and the desktop matchMedia
    // effect to settle (the FAB depends on useIsDesktop flipping true).
    const fabBtn = await waitFor(() =>
      screen.getByRole('button', { name: /^invite$/i })
    )

    const stickyOrBanner = screen.getAllByRole('button', {
      name: /invite a roaster/i,
    })
    // Sticky CTA + banner CTA both render — at least two.
    expect(stickyOrBanner.length).toBeGreaterThanOrEqual(2)

    // Three+ CTA clicks across distinct surfaces.
    stickyOrBanner.forEach((btn) => fireEvent.click(btn))
    fireEvent.click(fabBtn)

    // Despite the clicks, fetch was called exactly once: the provider's
    // mount-time POST /api/invite-codes. (Post-commit-nudge is covered
    // separately in post-commit-nudge.test.tsx.)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/invite-codes', {
      method: 'POST',
    })
  })

  it('opens the invite modal on click', async () => {
    installInviteFetchMock({ kind: 'ready' })
    await renderCampaignPage()
    const ctas = await waitFor(() =>
      screen.getAllByRole('button', { name: /invite a roaster/i })
    )
    fireEvent.click(ctas[0])
    // The modal title is unique to it and should now be visible.
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /^invite a roaster$/i })
      ).toBeInTheDocument()
    )
  })
})

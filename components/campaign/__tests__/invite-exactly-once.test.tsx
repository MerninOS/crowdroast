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
    const fetchMock = installInviteFetchMock({ kind: 'ready', hubCity: 'Austin' })
    await renderCampaignPage()

    // Wait for both the provider fetch and the desktop matchMedia effect
    // to settle. Multiple invite CTAs render: the InvitePoke under the
    // tier card, the InviteBanner CTA, the InviteFab, and a "copy link"
    // mini-link inside the banner. Click them all.
    const allInviteCtas = await waitFor(() => {
      const ctas = screen.getAllByRole('button', { name: /invite/i })
      if (ctas.length < 3) throw new Error('FAB / banner not yet rendered')
      return ctas
    })
    expect(allInviteCtas.length).toBeGreaterThanOrEqual(3)
    allInviteCtas.forEach((btn) => fireEvent.click(btn))

    // Despite the clicks, fetch was called exactly once: the provider's
    // mount-time POST /api/invite-codes.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/invite-codes', {
      method: 'POST',
    })
  })

  it('opens the invite modal on click', async () => {
    installInviteFetchMock({ kind: 'ready', hubCity: 'Austin' })
    await renderCampaignPage()
    const ctas = await waitFor(() =>
      screen.getAllByRole('button', { name: /invite/i })
    )
    fireEvent.click(ctas[0])
    // "Your referral link" is unique to the modal body — use it to
    // confirm the modal opened.
    await waitFor(() =>
      expect(screen.getByText(/your referral link/i)).toBeInTheDocument()
    )
  })
})

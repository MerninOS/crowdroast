// @vitest-environment jsdom

/**
 * Criterion 3 — Invite banner placement and copy.
 *
 * Given a buyer scrolling the campaign page, the banner section will render
 * between the tier section and the social-proof section, with copy that
 * substitutes the buyer's hubCity and references the $10 credit (sourced
 * from REFERRAL_CREDIT_AMOUNT_CENTS).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { InviteDataProvider } from '@/hooks/use-invite-data'
import { InviteBanner } from '@/components/campaign/InviteBanner'
import { installInviteFetchMock, renderCampaignPage } from './test-helpers'
import { REFERRAL_CREDIT_AMOUNT_CENTS } from '@/lib/referrals/settle-attribution'

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

const dollar = REFERRAL_CREDIT_AMOUNT_CENTS / 100

describe('InviteBanner (criterion 3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders with hub city in title and $10 credit body', async () => {
    installInviteFetchMock({ kind: 'ready', hubCity: 'Austin' })
    render(
      <InviteDataProvider>
        <InviteBanner onOpen={() => {}} />
      </InviteDataProvider>
    )
    await waitFor(() =>
      expect(screen.getByText(/Bring your Austin roast crew/i)).toBeInTheDocument()
    )
    // Body text mentions the credit, sourced from the constant.
    expect(
      screen.getByText(new RegExp(`\\$${dollar}\\b`, 'i'))
    ).toBeInTheDocument()
  })

  it('does not render when buyer has no hub', async () => {
    installInviteFetchMock({ kind: 'no-hub' })
    const { container } = render(
      <InviteDataProvider>
        <InviteBanner onOpen={() => {}} />
      </InviteDataProvider>
    )
    await waitFor(() => expect(container.firstChild).toBeNull())
  })

  it('places banner BETWEEN tier and social-proof sections in CampaignPage DOM order', async () => {
    installInviteFetchMock({ kind: 'ready', hubCity: 'Austin' })
    const { container } = await renderCampaignPage()
    await waitFor(() =>
      expect(container.querySelector('[data-section="invite-banner"]')).not.toBeNull()
    )
    const sections = Array.from(
      container.querySelectorAll('[data-section]')
    ).map((el) => el.getAttribute('data-section'))
    const tierIdx = sections.indexOf('tier')
    const bannerIdx = sections.indexOf('invite-banner')
    const socialIdx = sections.indexOf('social')
    expect(tierIdx).toBeGreaterThanOrEqual(0)
    expect(bannerIdx).toBeGreaterThan(tierIdx)
    expect(socialIdx).toBeGreaterThan(bannerIdx)
  })
})

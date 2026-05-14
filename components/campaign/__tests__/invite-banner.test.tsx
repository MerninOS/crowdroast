// @vitest-environment jsdom

/**
 * Criterion 3 — Invite banner placement and copy.
 *
 * The redesigned InviteBanner is a full-width espresso card with tomato
 * shadow, placed in its own section between the farmer card and the
 * social proof per the prototype. It substitutes the buyer's hubCity
 * into the headline and references the credit amount sourced from
 * REFERRAL_CREDIT_AMOUNT_CENTS.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { InviteDataProvider } from '@/hooks/use-invite-data'
import { InviteBanner } from '@/components/campaign/InviteBanner'
import { installInviteFetchMock, renderCampaignPage } from './test-helpers'
import { REFERRAL_CREDIT_AMOUNT_CENTS } from '@/lib/referrals/settle-attribution'

vi.mock('@/components/campaign/CampaignCommitForm', () => ({
  CampaignCommitForm: ({ onSuccess }: { onSuccess?: () => void }) => (
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

  it('renders with hub city in title and credit amount in body', async () => {
    installInviteFetchMock({ kind: 'ready', hubCity: 'Austin' })
    render(
      <InviteDataProvider>
        <InviteBanner
          kgToNext={120}
          nextTierName="Full Tier"
          nextIsStretch={false}
          onOpen={() => {}}
        />
      </InviteDataProvider>
    )
    await waitFor(() =>
      expect(screen.getByText(/Bring your/i)).toBeInTheDocument()
    )
    // City appears multiple times (headline + body) — assert >= 1.
    expect(screen.getAllByText('Austin').length).toBeGreaterThan(0)
    // Credit derived from the constant — never literal.
    expect(
      screen.getByText(new RegExp(`\\$${dollar}\\b`, 'i'))
    ).toBeInTheDocument()
  })

  it('does not render when buyer has no hub', async () => {
    installInviteFetchMock({ kind: 'no-hub' })
    const { container } = render(
      <InviteDataProvider>
        <InviteBanner
          kgToNext={120}
          nextTierName="Full Tier"
          nextIsStretch={false}
          onOpen={() => {}}
        />
      </InviteDataProvider>
    )
    await waitFor(() => expect(container.firstChild).toBeNull())
  })

  it('renders inside the campaign page in the correct section order', async () => {
    installInviteFetchMock({ kind: 'ready', hubCity: 'Austin' })
    const { container } = await renderCampaignPage()
    await waitFor(() =>
      expect(
        container.querySelector('[data-section="invite-banner"]')
      ).not.toBeNull()
    )
    const sections = Array.from(
      container.querySelectorAll('[data-section]')
    ).map((el) => el.getAttribute('data-section'))
    const progressIdx = sections.indexOf('bag-grid')
    const bannerIdx = sections.indexOf('invite-banner')
    const socialIdx = sections.indexOf('social')
    expect(progressIdx).toBeGreaterThanOrEqual(0)
    expect(bannerIdx).toBeGreaterThan(progressIdx)
    expect(socialIdx).toBeGreaterThan(bannerIdx)
  })
})

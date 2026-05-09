// @vitest-environment jsdom

/**
 * Criterion 8 — Hub-local copy substitution.
 *
 * Every invite surface substitutes the buyer's hubCity into the templated
 * copy. When hubCity is null the copy gracefully drops the city phrase
 * but keeps hubName — never renders "your null roast crew".
 *
 * Parameterized over Austin and Portland to catch hard-coded "Austin"
 * literals.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { InviteDataProvider } from '@/hooks/use-invite-data'

vi.mock('@/components/unit-provider', () => ({
  useUnitPreference: () => ({ unit: 'lb' }),
}))
import { InviteBanner } from '@/components/campaign/InviteBanner'
import { InvitePoke } from '@/components/campaign/InvitePoke'
import { PostCommitNudge } from '@/components/campaign/PostCommitNudge'
import { InviteModal } from '@/components/campaign/InviteModal'
import { installInviteFetchMock } from './test-helpers'

const modalProps = {
  open: true,
  onClose: () => {},
  lotId: 'lot-abc12345',
  lotCountry: 'Ethiopia',
  lotName: 'Yirgacheffe Natural',
}

describe.each([
  { city: 'Austin' as const },
  { city: 'Portland' as const },
])(
  'hub-local copy substitutes city=$city across surfaces (criterion 8)',
  ({ city }) => {
    beforeEach(() => {
      installInviteFetchMock({ kind: 'ready', hubCity: city, hubName: 'Mother Hub' })
    })

    it('InviteBanner uses the hub city', async () => {
      render(
        <InviteDataProvider>
          <InviteBanner
            kgToNext={150}
            nextTierName="Full Tier"
            nextIsStretch={false}
            onOpen={() => {}}
          />
        </InviteDataProvider>
      )
      await waitFor(() =>
        expect(screen.getAllByText(city).length).toBeGreaterThan(0)
      )
    })

    it('InvitePoke uses the hub city', async () => {
      render(
        <InviteDataProvider>
          <InvitePoke kgToNext={150} onOpen={() => {}} />
        </InviteDataProvider>
      )
      await waitFor(() =>
        expect(
          screen.getByText(new RegExp(`local ${city} roasters`, 'i'))
        ).toBeInTheDocument()
      )
    })

    it('PostCommitNudge uses the hub city', async () => {
      render(
        <InviteDataProvider>
          <PostCommitNudge visible={true} onOpen={() => {}} />
        </InviteDataProvider>
      )
      await waitFor(() =>
        expect(
          screen.getByText(new RegExp(`bring your ${city} crew`, 'i'))
        ).toBeInTheDocument()
      )
    })

    it('InviteModal hub-explainer band uses hub name + city', async () => {
      render(
        <InviteDataProvider>
          <InviteModal {...modalProps} />
        </InviteDataProvider>
      )
      await waitFor(() => {
        const band = screen.getByText(/CrowdRoast is/i)
        expect(band).toHaveTextContent('Mother Hub')
        expect(band).toHaveTextContent(city)
      })
    })
  }
)

describe('hub-local copy with null hubCity (graceful fallback)', () => {
  beforeEach(() => {
    installInviteFetchMock({ kind: 'ready', hubCity: null, hubName: 'Mother Hub' })
  })

  it('InviteBanner drops the city phrase but keeps the hub', async () => {
    render(
      <InviteDataProvider>
        <InviteBanner
          kgToNext={150}
          nextTierName="Full Tier"
          nextIsStretch={false}
          onOpen={() => {}}
        />
      </InviteDataProvider>
    )
    await waitFor(() =>
      expect(screen.getByText(/Bring your/i)).toBeInTheDocument()
    )
    expect(screen.queryByText(/your null/i)).not.toBeInTheDocument()
  })

  it('PostCommitNudge generic copy when no city', async () => {
    render(
      <InviteDataProvider>
        <PostCommitNudge visible={true} onOpen={() => {}} />
      </InviteDataProvider>
    )
    await waitFor(() =>
      expect(screen.getByText(/now bring your crew/i)).toBeInTheDocument()
    )
    expect(screen.queryByText(/from null/i)).not.toBeInTheDocument()
  })
})

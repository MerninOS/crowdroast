// @vitest-environment jsdom

/**
 * Criterion 8 — Hub-local copy substitution.
 *
 * Every invite surface substitutes the buyer's hubCity into the templated
 * copy. When hubCity is null the copy gracefully drops the city phrase but
 * keeps hubName — never renders "your null roast crew".
 *
 * Parameterized over Austin and Portland to catch hard-coded "Austin"
 * literals.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { InviteDataProvider } from '@/hooks/use-invite-data'
import { InviteBanner } from '@/components/campaign/InviteBanner'
import { StickyInvitePoke } from '@/components/campaign/StickyInvitePoke'
import { PostCommitNudge } from '@/components/campaign/PostCommitNudge'
import { InviteModal } from '@/components/campaign/InviteModal'
import { installInviteFetchMock } from './test-helpers'

describe.each([
  { city: 'Austin' as const },
  { city: 'Portland' as const },
])('hub-local copy substitutes city=$city across surfaces (criterion 8)', ({ city }) => {
  beforeEach(() => {
    installInviteFetchMock({ kind: 'ready', hubCity: city, hubName: 'Mother Hub' })
  })

  it('InviteBanner uses the hub city', async () => {
    render(
      <InviteDataProvider>
        <InviteBanner onOpen={() => {}} />
      </InviteDataProvider>
    )
    await waitFor(() =>
      expect(screen.getByText(new RegExp(`Bring your ${city} roast crew`, 'i')))
        .toBeInTheDocument()
    )
  })

  it('StickyInvitePoke uses the hub city in the helper', async () => {
    render(
      <InviteDataProvider>
        <StickyInvitePoke onOpen={() => {}} />
      </InviteDataProvider>
    )
    await waitFor(() =>
      expect(screen.getByText(new RegExp(`${city} crew`, 'i'))).toBeInTheDocument()
    )
  })

  it('PostCommitNudge uses the hub city', async () => {
    render(
      <InviteDataProvider>
        <PostCommitNudge visible={true} onOpen={() => {}} />
      </InviteDataProvider>
    )
    await waitFor(() =>
      expect(screen.getByText(new RegExp(`from ${city}`, 'i'))).toBeInTheDocument()
    )
  })

  it('InviteModal hub-explainer band uses the hub name + city', async () => {
    render(
      <InviteDataProvider>
        <InviteModal open={true} onOpenChange={() => {}} />
      </InviteDataProvider>
    )
    await waitFor(() => {
      const band = screen.getByText(/CrowdRoast is hub-local/i)
      expect(band).toHaveTextContent('Mother Hub')
      expect(band).toHaveTextContent(city)
    })
  })
})

describe('hub-local copy with null hubCity (graceful fallback)', () => {
  beforeEach(() => {
    installInviteFetchMock({ kind: 'ready', hubCity: null, hubName: 'Mother Hub' })
  })

  it('InviteBanner drops the city phrase but keeps the hub', async () => {
    render(
      <InviteDataProvider>
        <InviteBanner onOpen={() => {}} />
      </InviteDataProvider>
    )
    await waitFor(() =>
      expect(screen.getByText(/Bring your roast crew/i)).toBeInTheDocument()
    )
    expect(screen.queryByText(/your null roast crew/i)).not.toBeInTheDocument()
  })

  it('PostCommitNudge generic copy when no city', async () => {
    render(
      <InviteDataProvider>
        <PostCommitNudge visible={true} onOpen={() => {}} />
      </InviteDataProvider>
    )
    await waitFor(() =>
      expect(screen.getByText(/now bring a friend/i)).toBeInTheDocument()
    )
    expect(screen.queryByText(/from null/i)).not.toBeInTheDocument()
  })
})

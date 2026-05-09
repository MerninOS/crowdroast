// @vitest-environment jsdom

/**
 * Criterion 5 — Post-commit nudge.
 *
 * Before commit: nudge is absent from DOM.
 * After successful commit: nudge appears next to the form.
 * Failed commits never set visible upstream → nudge stays absent.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { InviteDataProvider } from '@/hooks/use-invite-data'
import { PostCommitNudge } from '@/components/campaign/PostCommitNudge'
import { installInviteFetchMock } from './test-helpers'

describe('PostCommitNudge (criterion 5)', () => {
  beforeEach(() => {
    installInviteFetchMock({ kind: 'ready' })
  })

  it('does NOT render before a commit (visible=false)', () => {
    const { container } = render(
      <InviteDataProvider>
        <PostCommitNudge visible={false} onOpen={() => {}} />
      </InviteDataProvider>
    )
    expect(container.firstChild).toBeNull()
    expect(screen.queryByText(/now bring your/i)).toBeNull()
  })

  it('renders after a commit (visible=true)', async () => {
    render(
      <InviteDataProvider>
        <PostCommitNudge visible={true} onOpen={() => {}} />
      </InviteDataProvider>
    )
    await waitFor(() =>
      expect(screen.getByText(/you're in/i)).toBeInTheDocument()
    )
    expect(screen.getByText(/now bring your.*crew/i)).toBeInTheDocument()
  })

  it('stays absent when invite data is errored even with visible=true', async () => {
    installInviteFetchMock({ kind: 'error' })
    const { container } = render(
      <InviteDataProvider>
        <PostCommitNudge visible={true} onOpen={() => {}} />
      </InviteDataProvider>
    )
    await waitFor(() => expect(container.firstChild).toBeNull())
  })
})

// @vitest-environment jsdom

/**
 * Criterion 10 — No auction jargon.
 *
 * The rendered DOM text must not contain the substrings "paddle", "hammer",
 * or "raised" (auction sense). "block" is checked separately to avoid
 * matching legitimate words like "blocked" or "blockchain".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import {
  installInviteFetchMock,
  renderCampaignPage,
  setViewportIsDesktop,
} from './test-helpers'

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

describe('CampaignPage — no auction jargon (criterion 10)', () => {
  beforeEach(() => {
    setViewportIsDesktop(true)
    installInviteFetchMock({ kind: 'ready' })
  })

  it('rendered visible text does not include paddle / hammer / raised', async () => {
    const { container } = await renderCampaignPage()
    // Wait for the asynchronous invite fetch to settle.
    await waitFor(() => {
      const ctas = container.querySelectorAll('button')
      // At least the commit + sticky + banner + (maybe FAB) buttons
      // should be present once everything has rendered.
      expect(ctas.length).toBeGreaterThan(2)
    })

    const visibleText = (container.textContent ?? '').toLowerCase()
    expect(visibleText).not.toMatch(/\bpaddle\b/)
    expect(visibleText).not.toMatch(/\bhammer\b/)
    expect(visibleText).not.toMatch(/\braised\b/)
  })

  it('does not include "block" used in the auction sense', async () => {
    const { container } = await renderCampaignPage()
    await waitFor(() => container.querySelector('h1'))
    const visibleText = (container.textContent ?? '').toLowerCase()
    // Auction-sense usages would look like "the block", "next block",
    // "top of the block", etc. Allow legitimate words like "blocked"
    // or "blockchain" by requiring word-boundary "block" (no suffix).
    expect(visibleText).not.toMatch(/\btop of the block\b/)
    expect(visibleText).not.toMatch(/\bnext block\b/)
    expect(visibleText).not.toMatch(/\bthe block\b/)
  })
})

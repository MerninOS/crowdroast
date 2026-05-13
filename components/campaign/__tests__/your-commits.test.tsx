// @vitest-environment jsdom

/**
 * YourCommits — the bag-aware "Your bags so far" block on the new
 * buyer campaign page.
 *
 * Verifies:
 *  - Renders nothing when the viewer has no commits on the campaign.
 *  - Renders one row per viewer commit, filtered by `userId`.
 *  - Each row shows the buyer's bag-aware Locked/Filling split (via the
 *    underlying LockedFillingPill), driven by the chronological bag
 *    assignment over ALL campaign commits (not just the viewer's).
 *  - The header carries the refund-rule reminder.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { YourCommits } from '@/components/campaign/YourCommits'
import type { Commitment } from '@/lib/types'

vi.mock('@/components/unit-provider', () => ({
  useUnitPreference: () => ({ unit: 'kg' }),
}))

function commit(
  id: string,
  buyer_id: string,
  quantity_kg: number,
  created_at: string
): Commitment {
  return {
    id,
    buyer_id,
    quantity_kg,
    created_at,
  } as unknown as Commitment
}

describe('YourCommits', () => {
  it('returns null when the viewer has no commits on the campaign', () => {
    const { container } = render(
      <YourCommits
        userId="viewer-1"
        commitments={[]}
        bagSizeKg={40}
        totalCommittedKg={0}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders only the viewer\'s commitments, not other buyers\'', () => {
    const commits = [
      commit('c-other', 'other-buyer', 60, '2026-05-01T00:00:00Z'),
      commit('c-mine-1', 'viewer-1', 40, '2026-05-02T00:00:00Z'),
      commit('c-mine-2', 'viewer-1', 20, '2026-05-03T00:00:00Z'),
    ]
    render(
      <YourCommits
        userId="viewer-1"
        commitments={commits}
        bagSizeKg={40}
        totalCommittedKg={120}
      />
    )
    const items = screen.getAllByRole('listitem')
    expect(items.length).toBe(2)
    // The "60 kg" row from the other buyer must NOT render.
    expect(screen.queryByText(/60\s*kg/i)).not.toBeInTheDocument()
  })

  it('shows the bag-aware split derived from full-campaign chronological order', () => {
    // 40 kg bag size. Three commits in order: 60 (other), 40 (me), 20 (me).
    // Total = 120 kg → 3 bags complete. Other locks 40 + 20 split into bag 1 + bag 2.
    // My 40 kg sits in bag 2 (20) + bag 3 (20) — both locked → 40 locked, 0 filling.
    // My 20 kg sits in bag 3 (20) — locked → 20 locked, 0 filling.
    const commits = [
      commit('c-other', 'other-buyer', 60, '2026-05-01T00:00:00Z'),
      commit('c-mine-1', 'viewer-1', 40, '2026-05-02T00:00:00Z'),
      commit('c-mine-2', 'viewer-1', 20, '2026-05-03T00:00:00Z'),
    ]
    const { container } = render(
      <YourCommits
        userId="viewer-1"
        commitments={commits}
        bagSizeKg={40}
        totalCommittedKg={120}
      />
    )
    // No "Filling" pill on any list item — all viewer kg are locked at this total.
    // (The header copy mentions "Filling kg refund..." which is intentional
    // refund-rule reminder, not a status pill, so we scope to the list rows.)
    const items = Array.from(container.querySelectorAll('li'))
    for (const li of items) {
      expect((li.textContent ?? '').toLowerCase()).not.toContain('filling')
    }
    // Two "Locked" pills (one per row).
    const lockedPills = items.flatMap((li) =>
      Array.from(li.querySelectorAll('[aria-label*="locked" i]'))
    )
    expect(lockedPills.length).toBeGreaterThanOrEqual(2)
  })

  it('surfaces the partial-bag refund rule in the section header', () => {
    const commits = [commit('c-1', 'viewer-1', 14, '2026-05-01T00:00:00Z')]
    render(
      <YourCommits
        userId="viewer-1"
        commitments={commits}
        bagSizeKg={40}
        totalCommittedKg={14}
      />
    )
    expect(
      screen.getByText(/refund if the bag doesn['’]t complete/i)
    ).toBeInTheDocument()
  })
})

// @vitest-environment jsdom

/**
 * Criterion 1 — Tier progress visibility.
 *
 * Given an active campaign with total committed pounds below the next tier
 * threshold, the page will display (a) the current tier, (b) pounds remaining
 * to the next tier, and (c) a progress indicator whose fill width equals
 * committedPounds / nextTierThreshold.
 *
 * Tests TierLadder directly with three fixtures (0 / 50 / 100%) — guards
 * against hard-coded 50% bars passing the test.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TierLadder } from '@/components/campaign/TierLadder'

describe('TierLadder — progress visibility (criterion 1)', () => {
  const baseSteps = [
    { key: 'listed', label: 'Listed' },
    { key: 'trigger', label: 'Trigger' },
    { key: 'tier-0', label: '500 lb' },
    { key: 'stretch', label: 'Stretch' },
  ]

  it.each([
    { committed: 0, threshold: 600, expectedPct: 0, remaining: 600 },
    { committed: 300, threshold: 600, expectedPct: 50, remaining: 300 },
    { committed: 600, threshold: 600, expectedPct: 100, remaining: 0 },
  ])(
    'renders $expectedPct% fill and "$remaining lb" remaining for committed=$committed/threshold=$threshold',
    ({ committed, threshold, expectedPct, remaining }) => {
      const { container } = render(
        <TierLadder
          committedPounds={committed}
          nextTierThreshold={threshold}
          currentTierLabel="Trigger"
          nextTierLabel="500 lb"
          steps={baseSteps}
          currentStepKey="trigger"
        />
      )

      // (b) pounds remaining is rendered in the Starburst label
      expect(screen.getByText(`${remaining.toLocaleString()} lb`)).toBeInTheDocument()

      // (c) fill width = committed / threshold (exact percentage)
      const fill = container.querySelector('[style*="width:"]') as HTMLElement | null
      expect(fill).not.toBeNull()
      expect(fill!.style.width).toBe(`${expectedPct}%`)
    }
  )

  it('renders the top-tier celebration state when nextTierThreshold is 0', () => {
    render(
      <TierLadder
        committedPounds={1500}
        nextTierThreshold={0}
        currentTierLabel="Stretch"
        nextTierLabel={null}
        steps={baseSteps}
        currentStepKey="stretch"
      />
    )
    // Top-tier fallback — no NaN, no negative remaining.
    expect(screen.getByText(/top tier unlocked/i)).toBeInTheDocument()
    expect(screen.queryByText(/-/)).not.toBeInTheDocument()
  })

  it('shows the current tier label', () => {
    render(
      <TierLadder
        committedPounds={300}
        nextTierThreshold={600}
        currentTierLabel="Trigger"
        nextTierLabel="500 lb"
        steps={baseSteps}
        currentStepKey="trigger"
      />
    )
    // (a) current tier surfaced in the header
    expect(
      screen.getByRole('heading', { name: 'Trigger' })
    ).toBeInTheDocument()
  })
})

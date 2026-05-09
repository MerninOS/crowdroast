// @vitest-environment jsdom

/**
 * Criterion 1 — Tier progress visibility.
 *
 * The redesigned TierLadder takes kg-based props (committedKg, stretchKg)
 * and reads the unit toggle from useUnitPreference. The mocked unit
 * provider in this test returns 'lb', so visible text is in lb. The fill
 * width is unit-agnostic — it's always committedKg / stretchKg.
 *
 * Three fixtures (0/50/100% of the *stretch goal*) guard against a
 * hard-coded fill. Top-tier (100%) flips into the celebratory state.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TierLadder, type CampaignTier } from '@/components/campaign/TierLadder'

vi.mock('@/components/unit-provider', () => ({
  useUnitPreference: () => ({ unit: 'lb' }),
}))

const tiers: CampaignTier[] = [
  { id: 'listed', name: 'Listed', threshold: 0, priceKg: 8.0 },
  { id: 'trigger', name: 'Trigger', threshold: 25, priceKg: 8.0 },
  { id: 'full', name: 'Full Tier', threshold: 65, priceKg: 6.4 },
  { id: 'stretch', name: 'Stretch', threshold: 100, priceKg: 5.95 },
]

describe('TierLadder — progress visibility (criterion 1)', () => {
  it.each([
    { committedKg: 0, stretchKg: 100, expectedPct: 0 },
    { committedKg: 50, stretchKg: 100, expectedPct: 50 },
    { committedKg: 100, stretchKg: 100, expectedPct: 100 },
  ])(
    'renders fill = committedKg/stretchKg ($expectedPct%)',
    ({ committedKg, stretchKg, expectedPct }) => {
      const { container } = render(
        <TierLadder
          tiers={tiers}
          committedKg={committedKg}
          stretchKg={stretchKg}
          hype="calm"
        />
      )

      const fill = container.querySelector(
        '[data-testid="tier-progress-fill"]'
      ) as HTMLElement | null
      expect(fill).not.toBeNull()
      expect(fill!.style.width).toBe(`${expectedPct}%`)
    }
  )

  it('renders "X lb to {nextTier}." headline when below stretch (lb unit)', () => {
    // 50 kg committed / 100 kg stretch = 50% (current rung Trigger 25%);
    // next rung Full Tier at 65% = 65 kg. Remaining = 15 kg ≈ 33 lb.
    render(
      <TierLadder
        tiers={tiers}
        committedKg={50}
        stretchKg={100}
        hype="calm"
      />
    )
    expect(
      screen.getByRole('heading', { name: /\d+ lb.*to full tier/i })
    ).toBeInTheDocument()
  })

  it('renders "Stretch unlocked." celebratory state at 100%', () => {
    render(
      <TierLadder
        tiers={tiers}
        committedKg={100}
        stretchKg={100}
        hype="calm"
      />
    )
    expect(
      screen.getByRole('heading', { name: /stretch unlocked\.$/i })
    ).toBeInTheDocument()
    expect(screen.queryByText(/-\d/)).not.toBeInTheDocument()
  })

  it('shows the current tier in the eyebrow', () => {
    render(
      <TierLadder
        tiers={tiers}
        committedKg={50}
        stretchKg={100}
        hype="calm"
      />
    )
    expect(screen.getByText(/you're at trigger/i)).toBeInTheDocument()
  })
})

// @vitest-environment jsdom

/**
 * Criterion 1 — Tier progress visibility.
 *
 * The redesigned TierLadder takes the same shape as the prototype: a
 * tiers array (with thresholds as percentages of the stretch goal) and
 * the committed pounds. We assert (a) current tier surfaced, (b) lb to
 * next tier shown, (c) progress fill width = committed / stretchLb.
 *
 * Three fixtures (0/50/100% of the *stretch goal*) guard against a
 * hard-coded fill. Top-tier (100%) flips into the celebratory state.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TierLadder, type CampaignTier } from '@/components/campaign/TierLadder'

const tiers: CampaignTier[] = [
  { id: 'listed', name: 'Listed', threshold: 0, price: 8.0 },
  { id: 'trigger', name: 'Trigger', threshold: 25, price: 8.0 },
  { id: 'full', name: 'Full Tier', threshold: 65, price: 6.4 },
  { id: 'stretch', name: 'Stretch', threshold: 100, price: 5.95 },
]

describe('TierLadder — progress visibility (criterion 1)', () => {
  it.each([
    { committed: 0,    stretch: 600, expectedPct: 0,   nextLb: 150 },
    { committed: 300,  stretch: 600, expectedPct: 50,  nextLb: 90 },
    { committed: 600,  stretch: 600, expectedPct: 100, nextLb: 0 },
  ])(
    'renders fill = committed/stretch ($expectedPct%) and lb-to-next ($nextLb)',
    ({ committed, stretch, expectedPct }) => {
      const { container } = render(
        <TierLadder
          tiers={tiers}
          committed={committed}
          stretchLb={stretch}
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

  it('renders "X lb to {nextTier}." headline when below stretch', () => {
    render(
      <TierLadder
        tiers={tiers}
        committed={300}
        stretchLb={600}
        hype="calm"
      />
    )
    // 300 lb committed / 600 lb stretch — current rung is Trigger (25%);
    // next rung is Full Tier at 65% = 390 lb. Remaining = 90 lb.
    // Look up via the heading's accessible name (concatenates child text
    // across the <br/> in the markup) rather than a strict text match.
    expect(
      screen.getByRole('heading', { name: /90 lb.*to full tier/i })
    ).toBeInTheDocument()
  })

  it('renders "Stretch unlocked." celebratory state at 100%', () => {
    render(
      <TierLadder
        tiers={tiers}
        committed={600}
        stretchLb={600}
        hype="calm"
      />
    )
    expect(
      screen.getByRole('heading', { name: /stretch unlocked\.$/i })
    ).toBeInTheDocument()
    // Sanity: no negative number sneaks in via NaN/edge math.
    expect(screen.queryByText(/-\d/)).not.toBeInTheDocument()
  })

  it('shows the current tier in the eyebrow', () => {
    render(
      <TierLadder
        tiers={tiers}
        committed={300}
        stretchLb={600}
        hype="calm"
      />
    )
    expect(screen.getByText(/you're at trigger/i)).toBeInTheDocument()
  })
})

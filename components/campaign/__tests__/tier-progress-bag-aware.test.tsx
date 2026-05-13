// @vitest-environment jsdom

/**
 * Bag-aware TierLadder — eyebrow, dividers, status line, refund footnote.
 *
 * When `bagSizeKg` is set (>0), the ladder switches from a kg-percent
 * eyebrow ("You're at Trigger · 25%") to a bag-shaped one
 * ("3 of 5 bags locked · 14 kg into bag 4"). It also renders bag-boundary
 * dividers on the bar, a status line under the bar, and a refund-rule
 * footnote — the load-bearing copy that tells the buyer partial bags get
 * refunded.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TierLadder, type CampaignTier } from '@/components/campaign/TierLadder'

vi.mock('@/components/unit-provider', () => ({
  useUnitPreference: () => ({ unit: 'kg' }),
}))

const tiers: CampaignTier[] = [
  { id: 'trigger', name: 'Trigger', threshold: 50, priceKg: 8.0 },
  { id: 'tier-0', name: 'Full Tier', threshold: 75, priceKg: 7.0 },
  { id: 'stretch', name: 'Stretch', threshold: 100, priceKg: 6.5 },
]

describe('TierLadder — bag-aware (criterion 1b)', () => {
  it('eyebrow shows "X of N bags locked · Y kg into bag M" when filling', () => {
    // 5 bags total (200 / 40), 2 locked, 14 kg into bag 3.
    render(
      <TierLadder
        tiers={tiers}
        committedKg={94}
        stretchKg={200}
        bagSizeKg={40}
        minBagsToSucceed={3}
        hype="calm"
      />
    )
    // Eyebrow text breaks across spans, so use a regex over the live region.
    expect(
      screen.getByText(/2 of 5 bags locked/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/into bag 3/i)).toBeInTheDocument()
  })

  it('eyebrow drops the "into bag M" suffix when the total lands on a bag boundary', () => {
    render(
      <TierLadder
        tiers={tiers}
        committedKg={80}
        stretchKg={200}
        bagSizeKg={40}
        minBagsToSucceed={3}
        hype="calm"
      />
    )
    // 80 / 40 = 2 bags, no partial → no "into bag" suffix.
    expect(screen.getByText(/2 of 5 bags locked/i)).toBeInTheDocument()
    expect(screen.queryByText(/into bag/i)).not.toBeInTheDocument()
  })

  it('renders bag-boundary dividers on the progress bar when bag-aware', () => {
    const { container } = render(
      <TierLadder
        tiers={tiers}
        committedKg={94}
        stretchKg={200}
        bagSizeKg={40}
        hype="calm"
      />
    )
    const dividers = container.querySelector('[data-testid="bag-dividers"]')
    expect(dividers).not.toBeNull()
    // 5 bags → 4 dividers (between segments).
    expect(dividers!.children.length).toBe(4)
  })

  it('does not render bag dividers for legacy (null bagSizeKg) lots', () => {
    const { container } = render(
      <TierLadder
        tiers={tiers}
        committedKg={94}
        stretchKg={200}
        hype="calm"
      />
    )
    expect(
      container.querySelector('[data-testid="bag-dividers"]')
    ).toBeNull()
  })

  it('renders the bag status line with "Bag N" + remaining-to-completion when filling', () => {
    render(
      <TierLadder
        tiers={tiers}
        committedKg={94}
        stretchKg={200}
        bagSizeKg={40}
        hype="calm"
      />
    )
    const line = screen.getByTestId('bag-status-line')
    // Bag 3 filling, 14 kg in, 26 kg from completion.
    expect(line.textContent).toMatch(/Bag 3/)
    expect(line.textContent).toMatch(/14\s*kg\s*\/\s*40\s*kg/)
    expect(line.textContent).toMatch(/26\s*kg\s*from\s*completion/i)
  })

  it('renders "First bag\'s waiting" when nothing has been committed', () => {
    render(
      <TierLadder
        tiers={tiers}
        committedKg={0}
        stretchKg={200}
        bagSizeKg={40}
        hype="calm"
      />
    )
    expect(
      screen.getByTestId('bag-status-line').textContent
    ).toMatch(/First bag.+waiting/i)
  })

  it('renders the "more bags to settle" chip when below minBagsToSucceed', () => {
    render(
      <TierLadder
        tiers={tiers}
        committedKg={40}
        stretchKg={200}
        bagSizeKg={40}
        minBagsToSucceed={3}
        hype="calm"
      />
    )
    // 1 locked, needs 3 — 2 more to settle.
    expect(
      screen.getByText(/2 more bags to settle/i)
    ).toBeInTheDocument()
  })

  it('renders the refund-rule footnote (Only full bags ship.)', () => {
    render(
      <TierLadder
        tiers={tiers}
        committedKg={94}
        stretchKg={200}
        bagSizeKg={40}
        hype="calm"
      />
    )
    const footnote = screen.getByTestId('bag-refund-footnote')
    expect(footnote.textContent).toMatch(/only full bags ship/i)
    expect(footnote.textContent).toMatch(/refunds to your card/i)
  })

  it('does not render the refund footnote for legacy (null bagSizeKg) lots', () => {
    render(
      <TierLadder
        tiers={tiers}
        committedKg={94}
        stretchKg={200}
        hype="calm"
      />
    )
    expect(
      screen.queryByTestId('bag-refund-footnote')
    ).not.toBeInTheDocument()
  })
})

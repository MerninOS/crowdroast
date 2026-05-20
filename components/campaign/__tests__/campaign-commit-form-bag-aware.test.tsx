// @vitest-environment jsdom

/**
 * Bag-aware CampaignCommitForm — preset chips, split warning, footnote.
 *
 * Verifies:
 *  - Preset chips read as bag multiples / fractions instead of round kg.
 *  - "Top off" chip is shown when the open bag is partially filled and
 *    its remaining capacity differs from one full bag.
 *  - Clicking a preset chip sets the input to that exact display qty.
 *  - The CommitSplitWarning surfaces when the current qty crosses the
 *    open bag's remaining capacity, and stays absent when it fits.
 *  - The bottom footnote calls out partial-bag refunds.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CampaignCommitForm } from '@/components/campaign/CampaignCommitForm'

vi.mock('@/components/unit-provider', () => ({
  useUnitPreference: () => ({ unit: 'kg' }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {} }),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

function renderForm(overrides: Partial<React.ComponentProps<typeof CampaignCommitForm>> = {}) {
  return render(
    <CampaignCommitForm
      lotId="lot-1"
      activePricePerKg={8}
      maxKg={500}
      hubId="hub-1"
      activeTierName="Trigger"
      biddersIn={5}
      bagSizeKg={40}
      totalCommittedKg={14}
      {...overrides}
    />
  )
}

describe('CampaignCommitForm — bag-aware (commit flow)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders bag-aware preset chips (½ bag / 1 bag / 2 bags / Top off) instead of round-kg chips', () => {
    renderForm()
    expect(screen.getByRole('button', { name: /½ bag/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^1 bag$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /2 bags/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /top off/i })).toBeInTheDocument()
    // Legacy round-kg presets shouldn't render in bag-aware mode.
    expect(screen.queryByRole('button', { name: /^20 kg$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^40 kg$/i })).not.toBeInTheDocument()
  })

  it('omits the "Top off" chip when the open bag is already empty (boundary commit)', () => {
    // totalCommittedKg = 40 → bagRemainingKg = 40 → identical to one full bag → suppressed.
    renderForm({ totalCommittedKg: 40 })
    expect(screen.queryByRole('button', { name: /top off/i })).not.toBeInTheDocument()
  })

  it('clicking a preset chip updates the quantity input', () => {
    renderForm()
    const qtyInput = screen.getByLabelText(/quantity in kilograms/i) as HTMLInputElement

    fireEvent.click(screen.getByRole('button', { name: /^1 bag$/i }))
    expect(qtyInput.value).toBe('40')

    fireEvent.click(screen.getByRole('button', { name: /2 bags/i }))
    expect(qtyInput.value).toBe('80')
  })

  it('CommitSplitWarning is hidden when qty fits inside the open bag', () => {
    // Open bag has 26 kg remaining (40 - 14). 1 kg pledge fits easily.
    const { container } = renderForm({ totalCommittedKg: 14 })
    const qtyInput = screen.getByLabelText(/quantity in kilograms/i) as HTMLInputElement

    fireEvent.change(qtyInput, { target: { value: '1' } })

    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('CommitSplitWarning surfaces (with refund copy) when qty crosses the bag boundary', () => {
    // Open bag has 26 kg remaining. 50 kg pledge crosses by 24 kg → warning fires.
    renderForm({ totalCommittedKg: 14 })
    const qtyInput = screen.getByLabelText(/quantity in kilograms/i) as HTMLInputElement
    fireEvent.change(qtyInput, { target: { value: '50' } })

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/spans a bag boundary/i)).toBeInTheDocument()
    // The at-risk row spells out the refund rule.
    expect(
      screen.getByTestId('commit-split-warning-atrisk-row').textContent
    ).toMatch(/refunds if the bag doesn['’]t hit/i)
  })

  it('clicking "Top off" does NOT trigger the split warning when bagRemainingKg has decimals (would round up across boundary)', () => {
    // Open bag has 9.95 kg remaining (40 - 30.05). Without the kg-override
    // fix the "Top off" preset rounds 9.95 → 10.0 display kg, converts back
    // to 10.0 kg, and crosses the 9.95 boundary — falsely surfacing the
    // split warning even though the buyer's intent is to finish *this* bag.
    const { container } = renderForm({ totalCommittedKg: 30.05 })
    const topOffBtn = screen.getByRole('button', { name: /top off/i })

    fireEvent.click(topOffBtn)

    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(screen.queryByText(/spans a bag boundary/i)).toBeNull()
  })

  it('clicking "Top off" submits exactly bagRemainingKg (not the display-rounded value)', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )

    renderForm({ totalCommittedKg: 30.05 })
    fireEvent.click(screen.getByRole('button', { name: /top off/i }))
    fireEvent.submit(screen.getByRole('button', { name: /commit/i }).closest('form')!)

    // The form opens a confirm dialog; clicking its primary action issues the POST.
    const saveBtn = await screen.findByRole('button', { name: /save card & lock in/i })
    fireEvent.click(saveBtn)

    // Yield to the microtask that calls fetch.
    await Promise.resolve()
    await Promise.resolve()

    expect(fetchSpy).toHaveBeenCalled()
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    // 40 - 30.05 = 9.95 — the precise kg the open bag still needs.
    expect(body.quantity_kg).toBeCloseTo(9.95, 5)

    fetchSpy.mockRestore()
  })

  it('footnote text mentions partial-bag refund rule when bag-aware', () => {
    const { container } = renderForm()
    expect(container.textContent).toMatch(/only full bags ship/i)
  })

  it('falls back to legacy round-kg presets when bagSizeKg is null', () => {
    renderForm({ bagSizeKg: null, totalCommittedKg: 0 })
    expect(screen.getByRole('button', { name: /^20 kg$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^40 kg$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /½ bag/i })).not.toBeInTheDocument()
    // Legacy footnote is shown.
    const text = document.body.textContent ?? ''
    expect(text).toMatch(/refund in full if the campaign/i)
  })
})

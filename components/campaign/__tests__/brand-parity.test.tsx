// @vitest-environment jsdom

/**
 * Criterion 9 — Brand-system parity.
 *
 * The redesigned page uses the merninos design tokens consistently —
 * font-display for headlines, espresso borders >= 3px, flat-shadow tokens
 * (no soft drop shadows with blur), cream backgrounds. We assert presence
 * of the Tailwind utility classes that map to these tokens, since JSDOM
 * does not actually compute Tailwind CSS.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import {
  installInviteFetchMock,
  renderCampaignPage,
  setViewportIsDesktop,
} from './test-helpers'

vi.mock('@/components/commitment-form', () => ({
  CommitmentForm: ({ onSuccess }: { onSuccess?: () => void }) => (
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

describe('CampaignPage — brand-system parity (criterion 9)', () => {
  beforeEach(() => {
    setViewportIsDesktop(true)
    installInviteFetchMock({ kind: 'ready' })
  })

  it('main page heading uses the display font token', async () => {
    const { container } = await renderCampaignPage()
    await waitFor(() => container.querySelector('h1'))
    const heading = container.querySelector('h1')!
    expect(heading.className).toMatch(/\bfont-display\b/)
  })

  it('tier section uses espresso border >= 3px', async () => {
    const { container } = await renderCampaignPage()
    const tier = await waitFor(() =>
      container.querySelector('[data-section="tier"]')
    )
    // The TierLadder section uses border-[5px] border-espresso.
    expect(tier!.className).toMatch(/border-espresso/)
    expect(tier!.className).toMatch(/border-\[(?:[3-9]|\d{2,})px\]/)
  })

  it('cards use flat shadow tokens (no soft blurred shadows)', async () => {
    const { container } = await renderCampaignPage()
    await waitFor(() => container.querySelector('[data-section="tier"]'))
    // Pull the rendered HTML and assert the standard merninos shadow
    // token names are present somewhere AND there is no soft-shadow
    // class / inline style with a blur radius (a non-zero second value
    // in box-shadow would mean blur).
    const html = container.innerHTML
    expect(html).toMatch(/shadow-flat-(sm|md|lg)|shadow-\[\d+px_\d+px_0/)
    // Soft shadows in Tailwind look like `shadow-md` or `shadow-lg`
    // (which map to blurred shadows). They should NOT be present on
    // campaign components — sanity check via direct token name match.
    expect(html).not.toMatch(/\bshadow-(md|lg|xl|2xl)(\s|"|$)/)
  })

  it('uses cream background somewhere in the rendered tree', async () => {
    const { container } = await renderCampaignPage()
    await waitFor(() => container.querySelector('h1'))
    const html = container.innerHTML
    expect(html).toMatch(/\bbg-cream\b/)
  })
})

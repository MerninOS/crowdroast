// @vitest-environment jsdom

/**
 * Criterion 9 — Brand-system parity.
 *
 * The redesigned page hands off as inline-style JSX with CSS variables
 * (style={{ background: "var(--color-tomato)" }}). Tests assert the
 * inline-style tokens are present, plus a sanity check that no soft
 * blurred shadows have crept into the markup.
 *
 * JSDOM does NOT compute Tailwind utility CSS — that's why we use the
 * inline-style approach directly: it renders identically in JSDOM and
 * the browser, and the values are what we assert against.
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

describe('CampaignPage — brand-system parity (criterion 9)', () => {
  beforeEach(() => {
    setViewportIsDesktop(true)
    installInviteFetchMock({ kind: 'ready' })
  })

  it('main page heading uses the display font token', async () => {
    const { container } = await renderCampaignPage()
    await waitFor(() => container.querySelector('h1'))
    const heading = container.querySelector('h1') as HTMLElement | null
    expect(heading).not.toBeNull()
    // Inline style — JSDOM preserves it verbatim. The Adore Cats display
    // font gets read from --font-display via the CSS-var reference.
    expect(heading!.style.fontFamily).toBe('var(--font-display)')
  })

  it('progress section uses an espresso border >= 3px', async () => {
    const { container } = await renderCampaignPage()
    const progress = await waitFor(() =>
      container.querySelector('[data-section="bag-grid"]')
    )
    const progressEl = progress as HTMLElement
    // BagGridProgress uses border: 4px solid var(--color-espresso).
    expect(progressEl.style.border).toMatch(
      /[3-9]px solid var\(--color-espresso\)/
    )
  })

  it('cards use flat shadow tokens (no soft blur)', async () => {
    const { container } = await renderCampaignPage()
    await waitFor(() => container.querySelector('[data-section="bag-grid"]'))

    // Pull every element with an inline box-shadow and confirm the
    // shadow string never has a non-zero third value (blur radius).
    // Format: "Xpx Ypx 0[px] color" — flat. Soft shadows would look
    // like "0 4px 20px rgba(...)" with a non-zero third value.
    const all = container.querySelectorAll('*')
    let shadowsFound = 0
    for (const el of Array.from(all)) {
      const shadow = (el as HTMLElement).style.boxShadow
      if (!shadow) continue
      shadowsFound += 1
      // Each shadow should have its third value (blur) equal to 0 or 0px.
      // Match pattern "Xpx Ypx 0" or "Xpx Ypx 0px".
      expect(shadow).toMatch(/-?\d+px\s+-?\d+px\s+0(px)?\b/)
      // Sanity: the third value must NOT be a non-zero pixel blur.
      expect(shadow).not.toMatch(/-?\d+px\s+-?\d+px\s+[1-9]\d*px/)
    }
    expect(shadowsFound).toBeGreaterThan(0)
  })

  it('uses the cream surface token somewhere in the rendered tree', async () => {
    const { container } = await renderCampaignPage()
    await waitFor(() => container.querySelector('h1'))
    // Either --color-cream or --surface-app (which resolves to a cream-
    // family color) should appear somewhere in the inline styles.
    const html = container.innerHTML
    expect(
      html.includes('var(--color-cream)') ||
        html.includes('var(--surface-app)')
    ).toBe(true)
  })

  it('uses espresso for borders and text somewhere in the tree', async () => {
    const { container } = await renderCampaignPage()
    await waitFor(() => container.querySelector('h1'))
    const html = container.innerHTML
    expect(html).toContain('var(--color-espresso)')
  })
})

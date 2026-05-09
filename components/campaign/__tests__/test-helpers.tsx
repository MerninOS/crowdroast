// Shared fixtures and render helpers for campaign-page acceptance tests.
//
// vi.mock() calls cannot live here — they are hoisted by vitest only when
// declared at the top of a test file. So this module exposes only data
// fixtures and rendering helpers; each test file declares its own mocks.

import * as React from 'react'
import { render, type RenderResult } from '@testing-library/react'
import { vi, type MockInstance } from 'vitest'
import type { Lot, PricingTier } from '@/lib/types'
import type { CampaignSocialProof } from '@/lib/lots/social-proof'

export const mockLot: Lot = {
  id: 'lot-123',
  seller_id: 'seller-abc',
  hub_id: 'hub-789',
  title: 'Ethiopia Yirgacheffe Natural',
  origin_country: 'Ethiopia',
  region: 'Yirgacheffe',
  farm: 'Tadesse Wolde',
  variety: 'Heirloom',
  process: 'Natural',
  altitude_min: 1850,
  altitude_max: 2100,
  crop_year: '2025',
  score: 88,
  description: 'A vibrant natural-process Yirgacheffe with blueberry and jasmine.',
  total_quantity_kg: 680, // ~1500 lb
  committed_quantity_kg: 136, // ~300 lb
  min_commitment_kg: 91, // ~200 lb
  price_per_kg: 8.5,
  currency: 'USD',
  status: 'active',
  commitment_deadline: null,
  images: [],
  flavor_notes: ['blueberry', 'jasmine'],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  seller: {
    company_name: 'Altura Green Coffee',
    contact_name: 'João M.',
    country: 'Brazil',
  },
} as unknown as Lot

export const mockPricingTiers: PricingTier[] = [
  { lot_id: 'lot-123', min_quantity_kg: 227, price_per_kg: 8.0 } as PricingTier, // ~500 lb
  { lot_id: 'lot-123', min_quantity_kg: 454, price_per_kg: 7.5 } as PricingTier, // ~1000 lb
]

export const mockSocialProof: CampaignSocialProof = {
  recentCommitCount: 12,
  leaderboard: [
    { displayName: 'Hank Roastery', city: 'Austin, TX', kg: 109 },
    { displayName: 'Ember Coffee Co.', city: 'Portland, OR', kg: 82 },
    { displayName: 'Forty Seven Beans', city: null, kg: 54 },
  ],
  activity: [
    { id: 'a-1', displayName: 'Hank Roastery', city: 'Austin, TX', kg: 27, ago: '2m' },
    { id: 'a-2', displayName: 'Ember Coffee Co.', city: 'Portland, OR', kg: 36, ago: '14m' },
  ],
}

// ─── fetch mock for POST /api/invite-codes ────────────────────────────────────

export type InviteScenario =
  | { kind: 'ready'; hubName?: string; hubCity?: string | null }
  | { kind: 'no-hub' }
  | { kind: 'error' }
  | { kind: 'loading' }

export function installInviteFetchMock(scenario: InviteScenario): MockInstance {
  const fetchMock = vi.fn()
  global.fetch = fetchMock as unknown as typeof fetch

  if (scenario.kind === 'ready') {
    const data = {
      code: 'abc123',
      url: 'https://crowdroast.example/i/abc123',
      hubName: scenario.hubName ?? 'Mother Hub',
      hubCity: scenario.hubCity === undefined ? 'Austin' : scenario.hubCity,
    }
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => data,
    })
  } else if (scenario.kind === 'no-hub') {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({}) })
  } else if (scenario.kind === 'error') {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
  } else {
    fetchMock.mockReturnValue(new Promise(() => {}))
  }

  return fetchMock
}

// ─── matchMedia override for the desktop FAB ──────────────────────────────────

export function setViewportIsDesktop(isDesktop: boolean) {
  window.matchMedia = ((query: string) =>
    ({
      matches: query.includes('min-width: 1024px') ? isDesktop : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    } as MediaQueryList)) as typeof window.matchMedia
}

// ─── render helpers ───────────────────────────────────────────────────────────

export function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

export type CampaignPageOverrides = {
  lot?: Partial<Lot>
  socialProof?: CampaignSocialProof | null
  hubName?: string | null
  userId?: string | null
}

export async function renderCampaignPage(
  overrides: CampaignPageOverrides = {}
): Promise<RenderResult> {
  const { CampaignPage } = await import('@/components/campaign/CampaignPage')
  const lot = { ...mockLot, ...(overrides.lot ?? {}) } as Lot
  return render(
    <CampaignPage
      lot={lot}
      userId={overrides.userId === undefined ? 'user-456' : overrides.userId}
      viewerRole="buyer"
      hubId="hub-789"
      hubName={overrides.hubName === undefined ? 'Mother Hub' : overrides.hubName}
      pricingTiers={mockPricingTiers}
      socialProof={overrides.socialProof === null ? undefined : overrides.socialProof ?? mockSocialProof}
    />
  )
}

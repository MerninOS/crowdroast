// Social-proof aggregator for the buyer campaign page.
//
// Pure synchronous function: takes the commitments already fetched by the
// route loader and computes a server-rendered snapshot — recent commit
// count (last 24h) and a top-5 leaderboard by total pounds committed per
// buyer. V1 ships server-rendered only; no live ticker, polling, or
// realtime subscription. The live-marquee variant is a v2 deferral.

const KG_PER_LB = 0.45359237
const ONE_DAY_MS = 24 * 60 * 60 * 1000

export type SocialProofCommitment = {
  buyer_id: string
  quantity_kg: number
  created_at: string
  buyer:
    | { company_name: string | null; contact_name: string | null }
    | null
}

export type LeaderboardEntry = {
  displayName: string
  pounds: number
}

export type CampaignSocialProof = {
  recentCommitCount: number
  leaderboard: LeaderboardEntry[]
}

export function getCampaignSocialProof(
  commitments: SocialProofCommitment[]
): CampaignSocialProof {
  const now = Date.now()

  let recentCommitCount = 0
  for (const c of commitments) {
    const created = Date.parse(c.created_at)
    if (!Number.isNaN(created) && now - created < ONE_DAY_MS) {
      recentCommitCount += 1
    }
  }

  const byBuyer = new Map<string, LeaderboardEntry>()
  for (const c of commitments) {
    const pounds = c.quantity_kg / KG_PER_LB
    const displayName =
      c.buyer?.contact_name?.trim() ||
      c.buyer?.company_name?.trim() ||
      'Roaster'
    const existing = byBuyer.get(c.buyer_id)
    if (existing) {
      existing.pounds += pounds
    } else {
      byBuyer.set(c.buyer_id, { displayName, pounds })
    }
  }

  const leaderboard = Array.from(byBuyer.values())
    .sort((a, b) => b.pounds - a.pounds)
    .slice(0, 5)
    .map((entry) => ({ ...entry, pounds: Math.round(entry.pounds) }))

  return { recentCommitCount, leaderboard }
}

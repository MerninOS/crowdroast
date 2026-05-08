// Social-proof aggregator for the buyer campaign page.
//
// Pure synchronous function: takes the commitments already fetched by the
// route loader and computes a server-rendered snapshot — recent commit
// count (last 24h), top-5 leaderboard by total pounds per buyer, and a
// trimmed recent-activity feed. V1 ships server-rendered only; no live
// ticker, polling, or realtime subscription.

const KG_PER_LB = 0.45359237
const ONE_DAY_MS = 24 * 60 * 60 * 1000

export type SocialProofCommitment = {
  buyer_id: string
  quantity_kg: number
  created_at: string
  buyer:
    | {
        company_name: string | null
        contact_name: string | null
        city?: string | null
      }
    | null
}

export type LeaderboardEntry = {
  displayName: string
  city: string | null
  pounds: number
}

export type ActivityItem = {
  id: string
  displayName: string
  city: string | null
  pounds: number
  ago: string
}

export type CampaignSocialProof = {
  recentCommitCount: number
  leaderboard: LeaderboardEntry[]
  activity: ActivityItem[]
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

  // Aggregate by buyer for the leaderboard.
  const byBuyer = new Map<
    string,
    { displayName: string; city: string | null; pounds: number }
  >()
  for (const c of commitments) {
    const pounds = c.quantity_kg / KG_PER_LB
    const displayName = pickDisplayName(c.buyer)
    const city = c.buyer?.city ?? null
    const existing = byBuyer.get(c.buyer_id)
    if (existing) {
      existing.pounds += pounds
    } else {
      byBuyer.set(c.buyer_id, { displayName, city, pounds })
    }
  }
  const leaderboard = Array.from(byBuyer.values())
    .sort((a, b) => b.pounds - a.pounds)
    .slice(0, 5)
    .map((entry) => ({ ...entry, pounds: Math.round(entry.pounds) }))

  // Most recent commits for the activity feed (newest first, capped at 6).
  const activity = [...commitments]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, 6)
    .map<ActivityItem>((c, i) => ({
      id: `${c.buyer_id}-${c.created_at}-${i}`,
      displayName: pickDisplayName(c.buyer),
      city: c.buyer?.city ?? null,
      pounds: Math.round(c.quantity_kg / KG_PER_LB),
      ago: formatAgo(now - Date.parse(c.created_at)),
    }))

  return { recentCommitCount, leaderboard, activity }
}

function pickDisplayName(
  buyer: SocialProofCommitment['buyer']
): string {
  return (
    buyer?.contact_name?.trim() ||
    buyer?.company_name?.trim() ||
    'Roaster'
  )
}

function formatAgo(ms: number): string {
  if (Number.isNaN(ms) || ms < 0) return 'just now'
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

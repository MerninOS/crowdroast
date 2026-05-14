'use client'

import * as React from 'react'
import Link from 'next/link'
import { CampaignCommitForm } from './CampaignCommitForm'
import { InviteDataProvider } from '@/hooks/use-invite-data'
import { useUnitPreference } from '@/components/unit-provider'
import { formatUnitWeight } from '@/lib/units'
import { Marquee } from '@merninos/ui'
import { LotGallery } from './LotGallery'
import { Countdown } from './Countdown'
import { BagGridProgress } from './BagGridProgress'
import { type CampaignTier } from './TierLadder'
import { InvitePoke } from './InvitePoke'
import { InviteBanner } from './InviteBanner'
import { InviteFab } from './InviteFab'
import { PostCommitNudge } from './PostCommitNudge'
import { InviteModal } from './InviteModal'
import { SocialProof } from './SocialProof'
import { FarmerCard } from './FarmerCard'
import { YourCommits } from './YourCommits'
import type { Commitment, Lot, PricingTier, UserRole } from '@/lib/types'
import type { CampaignSocialProof } from '@/lib/lots/social-proof'

interface CampaignPageProps {
  lot: Lot
  userId: string | null
  viewerRole?: UserRole | null
  hubId?: string | null
  hubName?: string | null
  pricingTiers?: PricingTier[]
  /** All commitments on the active campaign — used to compute the viewer's
   *  bag-aware locked/filling split for the "Your Commits" block. The page
   *  already fetches this for social proof, so we plumb it through rather
   *  than re-querying client-side. */
  commitments?: Commitment[]
  socialProof?: CampaignSocialProof
  /** ISO timestamp of the active campaign's deadline. The page falls back to
   *  the lot's commitment_deadline if no active campaign exists (e.g. when a
   *  buyer is viewing a lot outside a hub context). */
  campaignDeadline?: string | null
  backHref?: string
  backLabel?: string
}

// Buyer-side campaign page orchestrator. Markup mirrors
// design/project/campaign/App.jsx beat for beat:
//   nav → hero (gallery + info column) → tier ladder + sticky poke
//     → marquee strip → farmer card → invite banner → social proof
//     → hub strip → fixed FAB → invite modal
//
// Guest visitors (userId === null) see a minimal hero + the existing
// "request access to this hub to commit" CTA, preserving the behavior
// covered by lot-detail-view-guest-cta.test.tsx.
export function CampaignPage(props: CampaignPageProps) {
  if (!props.userId) {
    return (
      <GuestView
        lot={props.lot}
        hubId={props.hubId}
        hubName={props.hubName}
        backHref={props.backHref}
        backLabel={props.backLabel}
      />
    )
  }
  return (
    <InviteDataProvider>
      <AuthenticatedView {...props} userId={props.userId} />
    </InviteDataProvider>
  )
}

function GuestView({
  lot,
  hubId,
  hubName,
  backHref,
  backLabel,
}: Pick<CampaignPageProps, 'lot' | 'hubId' | 'hubName' | 'backHref' | 'backLabel'>) {
  return (
    <div
      style={{
        // Scope override: the global --font-display is bound to Fredoka
        // by next/font on <body>. Re-bind it to Cal Sans (--font-headline)
        // for the campaign subtree only — every component below that uses
        // var(--font-display) now resolves to Cal Sans without changing
        // the global setup.
        ['--font-display' as string]: 'var(--font-headline)',
        // Full-bleed: break out of the dashboard shell's max-w-7xl + p-8
        // wrapper so the page spans the whole viewport regardless of
        // what container Next.js parents drop us into.
        width: '100vw',
        marginLeft: 'calc(50% - 50vw)',
        marginRight: 'calc(50% - 50vw)',
        background: 'var(--surface-app)',
        minHeight: '100vh',
        padding: '32px 24px',
      } as React.CSSProperties}
    >
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <BackLink hubId={hubId} backHref={backHref} backLabel={backLabel} />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 1fr)',
            gap: 32,
            alignItems: 'flex-start',
            marginTop: 18,
          }}
          className="cp-hero-grid"
        >
          <LotGallery lot={lot} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {hubName && (
              <div
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '.18em',
                  textTransform: 'uppercase',
                  color: 'var(--color-tomato)',
                }}
              >
                {hubName}
              </div>
            )}
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(40px, 4.6vw, 68px)',
                lineHeight: 0.86,
                textTransform: 'uppercase',
                margin: 0,
                color: 'var(--color-espresso)',
              }}
            >
              {lot.origin_country}
              <br />
              {lot.title}.
            </h1>
            {lot.description && (
              <p
                style={{
                  fontSize: 15,
                  color: 'var(--fg2)',
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                {lot.description}
              </p>
            )}
            <Link
              href="/auth/sign-up"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                height: 46,
                padding: '0 28px',
                width: 'fit-content',
                borderRadius: 9999,
                border: '2.5px solid var(--color-espresso)',
                background: 'var(--accent-1)',
                color: 'var(--accent-1-fg)',
                fontFamily: 'var(--font-body)',
                fontWeight: 800,
                fontSize: 14,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                textDecoration: 'none',
                boxShadow: '4px 4px 0 var(--color-espresso)',
              }}
            >
              Request access to this hub to commit
            </Link>
          </div>
        </div>
      </div>
      <style>{HERO_GRID_RESPONSIVE_CSS}</style>
    </div>
  )
}

function AuthenticatedView({
  lot,
  userId,
  viewerRole,
  hubId,
  hubName,
  pricingTiers = [],
  commitments = [],
  socialProof,
  campaignDeadline,
  backHref,
  backLabel,
}: CampaignPageProps & { userId: string }) {
  const [modalOpen, setModalOpen] = React.useState(false)
  const [hasCommitted, setHasCommitted] = React.useState(false)
  const openModal = React.useCallback(() => setModalOpen(true), [])
  const closeModal = React.useCallback(() => setModalOpen(false), [])

  const isOwner = userId === lot.seller_id
  const remainingKg = Math.max(0, lot.total_quantity_kg - lot.committed_quantity_kg)
  const canCommit =
    !isOwner && viewerRole === 'buyer' && lot.status === 'active' && remainingKg > 0

  const { unit } = useUnitPreference()
  const {
    tiers,
    stretchKg,
    committedKg,
    kgToNext,
    nextTier,
    nextIsStretch,
    activePrice,
    activeTier,
  } = React.useMemo(() => buildTierContext(lot, pricingTiers), [lot, pricingTiers])

  const bagSizeKg =
    lot.bag_size_kg != null && lot.bag_size_kg > 0 ? Number(lot.bag_size_kg) : null

  const biddersIn = socialProof?.recentCommitCount ?? 0

  return (
    <div
      style={{
        // Scope override: rebind --font-display from Fredoka (next/font's
        // global default) to Cal Sans (--font-headline) for the campaign
        // subtree only. See GuestView for the full rationale.
        ['--font-display' as string]: 'var(--font-headline)',
        // Full-bleed: break out of the dashboard shell's max-w-7xl + p-8
        // wrapper so the page spans the whole viewport.
        width: '100vw',
        marginLeft: 'calc(50% - 50vw)',
        marginRight: 'calc(50% - 50vw)',
        background: 'var(--surface-app)',
        minHeight: '100vh',
      } as React.CSSProperties}
    >
      {/* HERO — image left, info right */}
      <section className="cp-section" style={{ padding: '32px 24px 28px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <BackLink hubId={hubId} backHref={backHref} backLabel={backLabel} />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 1fr)',
              gap: 32,
              alignItems: 'flex-start',
              marginTop: 18,
            }}
            className="cp-hero-grid"
          >
            {/* Image gallery */}
            <LotGallery
              lot={lot}
              tierStatusLabel={
                committedKg > 0 && kgToNext === 0
                  ? `${nextTier.name} unlocked`
                  : null
              }
            />

            {/* Info column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  flexWrap: 'wrap',
                }}
              >
                <Pill variant="accent">Live · {momentum(committedKg, stretchKg)}</Pill>
                {hubName && <Pill variant="cream">{hubName}</Pill>}
              </div>

              <h1
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(40px, 4.6vw, 68px)',
                  lineHeight: 0.86,
                  textTransform: 'uppercase',
                  margin: 0,
                  color: 'var(--color-espresso)',
                }}
              >
                {lot.origin_country}
                <br />
                {lot.title}.
              </h1>

              {lot.description && (
                <p
                  style={{
                    fontSize: 15,
                    color: 'var(--fg2)',
                    lineHeight: 1.6,
                    margin: 0,
                  }}
                >
                  {lot.description}
                </p>
              )}

              {/* Countdown + roasters-in stat row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 14,
                  padding: '14px 0',
                  borderTop: '3px dashed var(--color-fog)',
                  borderBottom: '3px dashed var(--color-fog)',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div
                    className="eyebrow"
                    style={{
                      fontSize: 10,
                      letterSpacing: '.18em',
                      color: 'var(--color-tomato)',
                      marginBottom: 6,
                      fontWeight: 800,
                      textTransform: 'uppercase',
                    }}
                  >
                    Closes in
                  </div>
                  <Countdown
                    deadline={campaignDeadline ?? lot.commitment_deadline}
                  />
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div
                    className="eyebrow"
                    style={{
                      fontSize: 10,
                      letterSpacing: '.18em',
                      color: 'var(--fg2)',
                      marginBottom: 6,
                      fontWeight: 800,
                      textTransform: 'uppercase',
                    }}
                  >
                    Roasters in
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 42,
                      lineHeight: 1,
                      color: 'var(--color-espresso)',
                    }}
                  >
                    {biddersIn}
                  </div>
                </div>
              </div>

              {/* Commit form sits in hero right col */}
              {canCommit && (
                <CampaignCommitForm
                  lotId={lot.id}
                  activePricePerKg={activePrice}
                  maxKg={remainingKg}
                  hubId={hubId || undefined}
                  activeTierName={activeTier.name}
                  biddersIn={biddersIn}
                  bagSizeKg={bagSizeKg}
                  totalCommittedKg={lot.committed_quantity_kg}
                  onSuccess={() => setHasCommitted(true)}
                />
              )}

              <PostCommitNudge visible={hasCommitted} onOpen={openModal} />
            </div>
          </div>
        </div>
      </section>

      {/* BAG GRID — replaces the legacy TierLadder. Leads with bag count and
          total weight so the buyer can see exactly how many bags they (and
          other roasters) still need to commit to to unlock the next price. */}
      <section className="cp-section" style={{ padding: '8px 24px 40px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <BagGridProgress
            bagSizeKg={lot.bag_size_kg ?? 0}
            totalBags={
              lot.bag_size_kg && lot.bag_size_kg > 0
                ? Math.round(lot.total_quantity_kg / lot.bag_size_kg)
                : 0
            }
            filledBags={
              lot.bag_size_kg && lot.bag_size_kg > 0
                ? Math.floor(committedKg / lot.bag_size_kg)
                : 0
            }
            inProgressPct={
              lot.bag_size_kg && lot.bag_size_kg > 0
                ? ((committedKg % lot.bag_size_kg) / lot.bag_size_kg) * 100
                : 0
            }
            committedKg={committedKg}
            totalKg={lot.total_quantity_kg}
            basePricePerKg={lot.price_per_kg}
            pricingTiers={pricingTiers}
          >
            <div style={{ flex: '1 1 320px', minWidth: 0 }}>
              <InvitePoke kgToNext={kgToNext} onOpen={openModal} />
            </div>
          </BagGridProgress>
        </div>
      </section>

      {/* YOUR COMMITS — bag-aware, viewer-scoped */}
      {bagSizeKg !== null && (
        <section className="cp-section" style={{ padding: '0 24px 40px' }}>
          <div style={{ maxWidth: 1280, margin: '0 auto' }}>
            <YourCommits
              userId={userId}
              commitments={commitments}
              bagSizeKg={bagSizeKg}
              totalCommittedKg={lot.committed_quantity_kg}
            />
          </div>
        </section>
      )}

      {/* MARQUEE strip */}
      <Marquee
        items={buildMarqueeItems(socialProof, kgToNext, nextTier.name, unit)}
        inverted
        duration={36}
      />

      {/* FARMER */}
      {/* <FarmerCard lot={lot} hubName={hubName} /> */}

      {/* INVITE BANNER */}
      <section
        className="cp-section cp-section-bleed"
        style={{
          background: 'var(--color-tomato)',
          borderTop: '5px solid var(--color-espresso)',
          borderBottom: '5px solid var(--color-espresso)',
          padding: '56px 24px',
        }}
      >
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <InviteBanner
            kgToNext={kgToNext}
            nextTierName={nextTier.name}
            nextIsStretch={nextIsStretch}
            onOpen={openModal}
          />
        </div>
      </section>

      {/* SOCIAL PROOF */}
      {socialProof && (
        <SocialProof
          recentCommitCount={socialProof.recentCommitCount}
          leaderboard={socialProof.leaderboard}
          activity={socialProof.activity}
          lotIdShort={lot.id.slice(0, 8).toUpperCase()}
        />
      )}

      {/* Floating invite FAB */}
      <InviteFab onOpen={openModal} />

      {/* INVITE MODAL */}
      <InviteModal
        open={modalOpen}
        onClose={closeModal}
        lotId={lot.id}
        lotCountry={lot.origin_country}
        lotName={lot.title}
      />

      <style>{HERO_GRID_RESPONSIVE_CSS}</style>
    </div>
  )
}

// ─── shared ───────────────────────────────────────────────────────────────────

function BackLink({
  hubId,
  backHref,
  backLabel,
}: Pick<CampaignPageProps, 'hubId' | 'backHref' | 'backLabel'>) {
  return (
    <Link
      href={backHref || (hubId ? '/dashboard/buyer' : '/marketplace')}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'var(--font-body)',
        fontWeight: 800,
        fontSize: 12,
        letterSpacing: '.1em',
        textTransform: 'uppercase',
        color: 'var(--color-espresso)',
        padding: 0,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        textDecoration: 'none',
      }}
    >
      ← {backLabel || (hubId ? 'Back to campaigns' : 'Back to marketplace')}
    </Link>
  )
}

function Pill({
  variant,
  children,
}: {
  variant: 'accent' | 'cream'
  children: React.ReactNode
}) {
  const palette =
    variant === 'cream'
      ? { bg: 'var(--color-cream)', fg: 'var(--color-espresso)' }
      : { bg: 'var(--accent-1)', fg: 'var(--accent-1-fg)' }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 10px',
        borderRadius: 9999,
        border: '2px solid var(--color-espresso)',
        background: palette.bg,
        color: palette.fg,
        fontWeight: 800,
        fontSize: 10,
        letterSpacing: '.1em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

const HERO_GRID_RESPONSIVE_CSS = `
  @media (max-width: 900px) {
    .cp-hero-grid { grid-template-columns: 1fr !important; }
  }
  @media (max-width: 640px) {
    .cp-section { padding-left: 14px !important; padding-right: 14px !important; }
    .cp-section.cp-section-bleed { padding-top: 36px !important; padding-bottom: 36px !important; }
  }
`

// ─── helpers ──────────────────────────────────────────────────────────────────

function momentum(committedKg: number, stretchKg: number): string {
  const pct = stretchKg > 0 ? (committedKg / stretchKg) * 100 : 0
  if (pct >= 90) return 'Almost there'
  if (pct >= 50) return 'Mid momentum'
  if (pct >= 25) return 'Building'
  return 'Just listed'
}

type TierContext = {
  tiers: CampaignTier[]
  stretchKg: number
  committedKg: number
  kgToNext: number
  nextTier: CampaignTier
  nextIsStretch: boolean
  /** Price per kg at the active tier (used by the commit form). */
  activePrice: number
  activeTier: CampaignTier
}

function buildTierContext(lot: Lot, pricingTiers: PricingTier[]): TierContext {
  const stretchKg = lot.total_quantity_kg
  const committedKg = lot.committed_quantity_kg
  // Bag-aware lots key both trigger and tier thresholds off bag counts so
  // chip positions match the bag-shaped settlement math in
  // lib/settle-bag-pricing.ts. Legacy (null bag_size_kg) keeps the kg-based
  // thresholds the existing tier-progress test pins.
  const bagSizeKg =
    lot.bag_size_kg != null && lot.bag_size_kg > 0 ? Number(lot.bag_size_kg) : null
  const minBagsToSucceed = Number(lot.min_bags_to_succeed ?? 0)
  const triggerKg =
    bagSizeKg !== null && minBagsToSucceed > 0
      ? minBagsToSucceed * bagSizeKg
      : lot.min_commitment_kg
  const sorted = [...pricingTiers].sort(
    (a, b) => a.min_quantity_kg - b.min_quantity_kg
  )

  // Build the 4-tier prototype shape: Listed / Trigger / each pricing tier / Stretch.
  // Threshold is a percentage (0-100) of the stretch goal — unit-agnostic.
  const listedTier: CampaignTier = {
    id: 'listed',
    name: 'Listed',
    threshold: 0,
    priceKg: lot.price_per_kg,
  }
  const triggerThreshold = stretchKg > 0 ? Math.round((triggerKg / stretchKg) * 100) : 0
  const triggerTier: CampaignTier = {
    id: 'trigger',
    name: 'Trigger',
    threshold: Math.max(0, triggerThreshold),
    priceKg: lot.price_per_kg,
  }
  const pricingTierSteps: CampaignTier[] = sorted.map((t, i) => {
    // Bag-aware: position the chip at the kg that corresponds to its min_bags
    // boundary. Falls back to the legacy min_quantity_kg if the tier was
    // not converted (min_bags === null) or the lot has no bag_size_kg yet.
    const tierKg =
      bagSizeKg !== null && t.min_bags !== null && t.min_bags !== undefined
        ? t.min_bags * bagSizeKg
        : t.min_quantity_kg
    const threshold =
      stretchKg > 0 ? Math.round((tierKg / stretchKg) * 100) : 0
    return {
      id: `tier-${i}`,
      name: i === sorted.length - 1 ? 'Full Tier' : 'Early Tier',
      threshold,
      priceKg: t.price_per_kg,
    }
  })
  const stretchPrice =
    sorted.length > 0 ? sorted[sorted.length - 1].price_per_kg : lot.price_per_kg
  const stretchTier: CampaignTier = {
    id: 'stretch',
    name: 'Stretch',
    threshold: 100,
    priceKg: stretchPrice,
  }

  // Listed and Trigger both carry the base price (lot.price_per_kg). When the
  // trigger sits above 0%, showing both rungs duplicates the same price on the
  // ladder — and the Listed chip reads as "✓ Unlocked" before the campaign
  // has actually triggered. Drop Listed in that case so the trigger price
  // shows as the next milestone, not as already unlocked.
  const allRungs =
    triggerTier.threshold > 0
      ? [triggerTier, ...pricingTierSteps, stretchTier]
      : [listedTier, ...pricingTierSteps, stretchTier]

  // Dedupe by ascending threshold so we don't surface a rung that collides
  // with a pricing tier at the same percentage.
  const tiers: CampaignTier[] = []
  for (const rung of allRungs) {
    const last = tiers[tiers.length - 1]
    if (!last || rung.threshold > last.threshold) {
      tiers.push(rung)
    }
  }

  const kgAtTier = (t: CampaignTier) => (t.threshold / 100) * stretchKg
  const nextTier = tiers.find((t) => kgAtTier(t) > committedKg) ?? tiers[tiers.length - 1]
  const kgToNext = Math.max(0, kgAtTier(nextTier) - committedKg)
  const nextIsStretch = nextTier.id === stretchTier.id

  // Active price = price of the highest tier whose threshold has been reached.
  const reached = [...tiers].reverse().find((t) => committedKg >= kgAtTier(t)) ?? tiers[0]
  const activePrice = reached.priceKg

  return {
    tiers,
    stretchKg,
    committedKg,
    kgToNext,
    nextTier,
    nextIsStretch,
    activePrice,
    activeTier: reached,
  }
}

function buildMarqueeItems(
  socialProof: CampaignSocialProof | undefined,
  kgToNext: number,
  nextTierName: string,
  unit: 'kg' | 'lb'
): string[] {
  const out: string[] = []
  if (socialProof?.activity) {
    for (const a of socialProof.activity.slice(0, 3)) {
      out.push(
        `${a.displayName} just committed ${formatUnitWeight(a.kg, unit, 0)} ${unit}`
      )
    }
  }
  if (kgToNext > 0) {
    out.push(`${formatUnitWeight(kgToNext, unit, 0)} ${unit} to ${nextTierName}`)
  }
  out.push('Bring a roaster · drop the price')
  if (out.length < 3) {
    out.push('Pooling demand to drop the price for everyone in')
  }
  return out
}

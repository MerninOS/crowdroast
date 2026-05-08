'use client'

import * as React from 'react'
import Link from 'next/link'
import { CampaignCommitForm } from './CampaignCommitForm'
import { InviteDataProvider } from '@/hooks/use-invite-data'
import { Marquee } from '@merninos/ui'
import { LotGallery } from './LotGallery'
import { Countdown } from './Countdown'
import { TierLadder, type CampaignTier } from './TierLadder'
import { InvitePoke } from './InvitePoke'
import { InviteBanner } from './InviteBanner'
import { InviteFab } from './InviteFab'
import { PostCommitNudge } from './PostCommitNudge'
import { InviteModal } from './InviteModal'
import { SocialProof } from './SocialProof'
import { FarmerCard } from './FarmerCard'
import type { Lot, PricingTier, UserRole } from '@/lib/types'
import type { CampaignSocialProof } from '@/lib/lots/social-proof'

const KG_PER_LB = 0.45359237
const toLb = (kg: number) => Math.round(kg / KG_PER_LB)

interface CampaignPageProps {
  lot: Lot
  userId: string | null
  viewerRole?: UserRole | null
  hubId?: string | null
  hubName?: string | null
  pricingTiers?: PricingTier[]
  socialProof?: CampaignSocialProof
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
        background: 'var(--surface-app)',
        minHeight: '100vh',
        padding: '32px 0',
      }}
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
  socialProof,
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

  const {
    tiers,
    stretchLb,
    committedLb,
    lbToNext,
    nextTier,
    nextIsStretch,
    activePrice,
    activeTier,
  } = React.useMemo(() => buildTierContext(lot, pricingTiers), [lot, pricingTiers])

  const biddersIn = socialProof?.recentCommitCount ?? 0

  return (
    <div style={{ background: 'var(--surface-app)', minHeight: '100vh' }}>
      {/* HERO — image left, info right */}
      <section style={{ padding: '32px 0 28px' }}>
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
                committedLb > 0 && lbToNext === 0
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
                <Pill variant="accent">Live · {momentum(committedLb, stretchLb)}</Pill>
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
                  <Countdown deadline={lot.commitment_deadline} />
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
                  onSuccess={() => setHasCommitted(true)}
                />
              )}

              <PostCommitNudge visible={hasCommitted} onOpen={openModal} />
            </div>
          </div>
        </div>
      </section>

      {/* TIER LADDER */}
      <section style={{ padding: '8px 0 40px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <TierLadder
            tiers={tiers}
            committed={committedLb}
            stretchLb={stretchLb}
            hype="rowdy"
          >
            <div style={{ marginTop: 18, maxWidth: 520 }}>
              <InvitePoke lbToNext={lbToNext} onOpen={openModal} />
            </div>
          </TierLadder>
        </div>
      </section>

      {/* MARQUEE strip */}
      <Marquee
        items={buildMarqueeItems(socialProof, lbToNext, nextTier.name)}
        inverted
        duration={36}
      />

      {/* FARMER */}
      <FarmerCard lot={lot} hubName={hubName} />

      {/* INVITE BANNER */}
      <section
        style={{
          background: 'var(--color-tomato)',
          borderTop: '5px solid var(--color-espresso)',
          borderBottom: '5px solid var(--color-espresso)',
          padding: '56px 0',
        }}
      >
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <InviteBanner
            lbToNext={lbToNext}
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
`

// ─── helpers ──────────────────────────────────────────────────────────────────

function momentum(committedLb: number, stretchLb: number): string {
  const pct = stretchLb > 0 ? (committedLb / stretchLb) * 100 : 0
  if (pct >= 90) return 'Almost there'
  if (pct >= 50) return 'Mid momentum'
  if (pct >= 25) return 'Building'
  return 'Just listed'
}

type TierContext = {
  tiers: CampaignTier[]
  stretchLb: number
  committedLb: number
  lbToNext: number
  nextTier: CampaignTier
  nextIsStretch: boolean
  activePrice: number
  activeTier: CampaignTier
}

function buildTierContext(lot: Lot, pricingTiers: PricingTier[]): TierContext {
  const stretchLb = toLb(lot.total_quantity_kg)
  const committedLb = toLb(lot.committed_quantity_kg)
  const triggerLb = toLb(lot.min_commitment_kg)
  const sorted = [...pricingTiers].sort(
    (a, b) => a.min_quantity_kg - b.min_quantity_kg
  )

  // Build the 4-tier prototype shape: Listed / Trigger / each pricing tier / Stretch.
  // Threshold is a percentage (0-100) of the stretch goal.
  const listedTier: CampaignTier = {
    id: 'listed',
    name: 'Listed',
    threshold: 0,
    price: lot.price_per_kg,
  }
  const triggerThreshold = stretchLb > 0 ? Math.round((triggerLb / stretchLb) * 100) : 0
  const triggerTier: CampaignTier = {
    id: 'trigger',
    name: 'Trigger',
    threshold: Math.max(0, triggerThreshold),
    price: lot.price_per_kg,
  }
  const pricingTierSteps: CampaignTier[] = sorted.map((t, i) => {
    const lbAt = toLb(t.min_quantity_kg)
    const threshold =
      stretchLb > 0 ? Math.round((lbAt / stretchLb) * 100) : 0
    return {
      id: `tier-${i}`,
      name: i === sorted.length - 1 ? 'Full Tier' : 'Early Tier',
      threshold,
      price: t.price_per_kg,
    }
  })
  const stretchPrice =
    sorted.length > 0 ? sorted[sorted.length - 1].price_per_kg : lot.price_per_kg
  const stretchTier: CampaignTier = {
    id: 'stretch',
    name: 'Stretch',
    threshold: 100,
    price: stretchPrice,
  }

  // Dedupe by ascending threshold so we don't surface a "Trigger" rung that
  // collides with a pricing tier at the same percentage.
  const allRungs = [listedTier, triggerTier, ...pricingTierSteps, stretchTier]
  const tiers: CampaignTier[] = []
  for (const rung of allRungs) {
    const last = tiers[tiers.length - 1]
    if (!last || rung.threshold > last.threshold) {
      tiers.push(rung)
    }
  }

  const lbAtTier = (t: CampaignTier) => Math.round((t.threshold / 100) * stretchLb)
  const nextTier = tiers.find((t) => lbAtTier(t) > committedLb) ?? tiers[tiers.length - 1]
  const lbToNext = Math.max(0, lbAtTier(nextTier) - committedLb)
  const nextIsStretch = nextTier.id === stretchTier.id

  // Active price = price of the highest tier whose threshold has been reached.
  const reached = [...tiers].reverse().find((t) => committedLb >= lbAtTier(t)) ?? tiers[0]
  const activePrice = reached.price

  return {
    tiers,
    stretchLb,
    committedLb,
    lbToNext,
    nextTier,
    nextIsStretch,
    activePrice,
    activeTier: reached,
  }
}

function buildMarqueeItems(
  socialProof: CampaignSocialProof | undefined,
  lbToNext: number,
  nextTierName: string
): string[] {
  const out: string[] = []
  if (socialProof?.activity) {
    for (const a of socialProof.activity.slice(0, 3)) {
      out.push(`${a.displayName} just committed ${a.pounds.toLocaleString()} lb`)
    }
  }
  if (lbToNext > 0) {
    out.push(`${lbToNext.toLocaleString()} lb to ${nextTierName}`)
  }
  out.push('Bring a roaster · drop the price')
  if (out.length < 3) {
    out.push('Pooling demand to drop the price for everyone in')
  }
  return out
}

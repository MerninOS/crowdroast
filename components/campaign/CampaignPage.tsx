'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@merninos/ui'
import { CommitmentForm } from '@/components/commitment-form'
import { InviteDataProvider } from '@/hooks/use-invite-data'
import { CampaignHero } from './CampaignHero'
import { TierLadder } from './TierLadder'
import { StickyInvitePoke } from './StickyInvitePoke'
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
  campaignDeadline?: string | null
  pricingTiers?: PricingTier[]
  socialProof?: CampaignSocialProof
  backHref?: string
  backLabel?: string
}

// Buyer-side campaign page orchestrator. Hosts the InviteDataProvider so
// the four invite CTAs share one fetch, owns the modal-open and
// commit-success state, and composes the redesigned components in the
// data-flow order from the spec.
//
// Guest visitors (userId === null) see a minimal hero + the existing
// "request access to this hub to commit" CTA — preserving the behavior
// covered by lot-detail-view-guest-cta.test.tsx so the guest path stays
// identical even though that test runs against LotDetailView, not this.
export function CampaignPage({
  lot,
  userId,
  viewerRole,
  hubId,
  hubName,
  campaignDeadline,
  pricingTiers = [],
  socialProof,
  backHref,
  backLabel,
}: CampaignPageProps) {
  if (!userId) {
    return (
      <GuestView
        lot={lot}
        hubId={hubId}
        hubName={hubName}
        backHref={backHref}
        backLabel={backLabel}
      />
    )
  }

  return (
    <InviteDataProvider>
      <AuthenticatedView
        lot={lot}
        userId={userId}
        viewerRole={viewerRole}
        hubId={hubId}
        hubName={hubName}
        campaignDeadline={campaignDeadline}
        pricingTiers={pricingTiers}
        socialProof={socialProof}
        backHref={backHref}
        backLabel={backLabel}
      />
    </InviteDataProvider>
  )
}

// ─── Guest ────────────────────────────────────────────────────────────────────

function GuestView({
  lot,
  hubId,
  hubName,
  backHref,
  backLabel,
}: Pick<CampaignPageProps, 'lot' | 'hubId' | 'hubName' | 'backHref' | 'backLabel'>) {
  return (
    <div className="flex flex-col gap-10 pb-16">
      <BackLink hubId={hubId} backHref={backHref} backLabel={backLabel} />
      <CampaignHero lot={lot} hubName={hubName} />
      <div className="flex justify-center">
        <Button asChild>
          <Link href="/auth/sign-up">Request access to this hub to commit</Link>
        </Button>
      </div>
    </div>
  )
}

// ─── Authenticated ────────────────────────────────────────────────────────────

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

  const isOwner = userId === lot.seller_id
  const remainingKg = Math.max(0, lot.total_quantity_kg - lot.committed_quantity_kg)
  const canCommit =
    !isOwner && viewerRole === 'buyer' && lot.status === 'active' && remainingKg > 0

  const activePrice = computeActivePrice(lot, pricingTiers)
  const tierProgress = computeTierProgress(lot, pricingTiers)
  const lotWithDeadline = { ...lot } // commitment_deadline already on lot

  return (
    <>
      <div className="flex flex-col gap-12 pb-16">
        <BackLink hubId={hubId} backHref={backHref} backLabel={backLabel} />

        <CampaignHero lot={lot} hubName={hubName} />

        <TierLadder
          {...tierProgress}
          commitmentDeadline={lotWithDeadline.commitment_deadline}
        >
          <StickyInvitePoke onOpen={openModal} />
        </TierLadder>

        <InviteBanner onOpen={openModal} />

        {socialProof && (
          <SocialProof
            recentCommitCount={socialProof.recentCommitCount}
            leaderboard={socialProof.leaderboard}
          />
        )}

        <FarmerCard lot={lot} hubName={hubName} />

        {canCommit && (
          <div className="flex flex-col gap-6">
            <CommitmentForm
              lotId={lot.id}
              activePrice={activePrice}
              maxKg={remainingKg}
              hubId={hubId || undefined}
              onSuccess={() => setHasCommitted(true)}
            />
            <PostCommitNudge visible={hasCommitted} onOpen={openModal} />
          </div>
        )}
      </div>

      <InviteFab onOpen={openModal} />
      <InviteModal open={modalOpen} onOpenChange={setModalOpen} />
    </>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function BackLink({
  hubId,
  backHref,
  backLabel,
}: Pick<CampaignPageProps, 'hubId' | 'backHref' | 'backLabel'>) {
  return (
    <Link
      href={backHref || (hubId ? '/dashboard/buyer' : '/marketplace')}
      className="inline-flex items-center gap-2 font-body text-sm font-bold uppercase tracking-[0.1em] text-espresso/70 hover:text-espresso transition-colors"
    >
      <ArrowLeft className="h-4 w-4" />
      {backLabel || (hubId ? 'Back to browse' : 'Back to marketplace')}
    </Link>
  )
}

function computeActivePrice(lot: Lot, pricingTiers: PricingTier[]): number {
  const sorted = [...pricingTiers].sort(
    (a, b) => a.min_quantity_kg - b.min_quantity_kg
  )
  let price = lot.price_per_kg
  for (const tier of [...sorted].reverse()) {
    if (lot.committed_quantity_kg >= tier.min_quantity_kg) {
      price = tier.price_per_kg
      break
    }
  }
  return price
}

function computeTierProgress(lot: Lot, pricingTiers: PricingTier[]) {
  const committedPounds = toLb(lot.committed_quantity_kg)
  const totalPounds = toLb(lot.total_quantity_kg)
  const triggerPounds = toLb(lot.min_commitment_kg)

  const sorted = [...pricingTiers].sort(
    (a, b) => a.min_quantity_kg - b.min_quantity_kg
  )

  const rawSteps: { key: string; label: string; threshold: number }[] = [
    { key: 'listed', label: 'Listed', threshold: 0 },
    { key: 'trigger', label: 'Trigger', threshold: triggerPounds },
    ...sorted.map((t, i) => ({
      key: `tier-${i}`,
      label: `${toLb(t.min_quantity_kg).toLocaleString()} lb`,
      threshold: toLb(t.min_quantity_kg),
    })),
    { key: 'stretch', label: 'Stretch', threshold: totalPounds },
  ]

  // Drop duplicates / out-of-order rungs (e.g., a pricing tier below trigger).
  const dedupedSteps: typeof rawSteps = []
  for (const step of rawSteps) {
    const last = dedupedSteps[dedupedSteps.length - 1]
    if (!last || step.threshold > last.threshold) {
      dedupedSteps.push(step)
    }
  }

  let currentIdx = 0
  for (let i = dedupedSteps.length - 1; i >= 0; i--) {
    if (dedupedSteps[i].threshold <= committedPounds) {
      currentIdx = i
      break
    }
  }

  const currentStep = dedupedSteps[currentIdx]
  const nextStep = dedupedSteps[currentIdx + 1] ?? null

  return {
    committedPounds,
    nextTierThreshold: nextStep?.threshold ?? 0,
    currentTierLabel: currentStep.label,
    nextTierLabel: nextStep?.label ?? null,
    steps: dedupedSteps.map((s) => ({ key: s.key, label: s.label })),
    currentStepKey: currentStep.key,
    ticks: undefined,
  }
}

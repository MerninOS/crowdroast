'use client'

import * as React from 'react'
import { useUnitPreference } from '@/components/unit-provider'
import { formatUnitWeight } from '@/lib/units'
import { useBagAssignment } from '@/hooks/use-bag-assignment'
import { LockedFillingPill } from './locked-filling-pill'
import type { Commitment } from '@/lib/types'

interface YourCommitsProps {
  /** The viewing buyer's user ID. */
  userId: string
  /** All commitments on the active campaign — used so the bag-aware
   *  chronological assignment matches the server. The component filters
   *  down to the viewer's own rows for display. */
  commitments: Commitment[]
  /** Bag size for this lot in kg. Caller must verify > 0. */
  bagSizeKg: number
  /** Total kg committed to this campaign — used to compute the remaining
   *  kg in the currently-filling bag. */
  totalCommittedKg: number
}

/**
 * Buyer-facing "Your Commits on This Lot" block.
 *
 * Renders one row per commitment the viewer has placed on this campaign,
 * each with a bag-aware Locked/Filling status pill. The chronological bag
 * assignment uses every campaign commit so the split here matches what
 * settlement will produce — earlier commits lock first, later commits
 * tip into the open bag.
 *
 * Returns null when the viewer has no commits, keeping the campaign page
 * quiet for first-time visitors.
 */
export function YourCommits({
  userId,
  commitments,
  bagSizeKg,
  totalCommittedKg,
}: YourCommitsProps): React.JSX.Element | null {
  const { unit } = useUnitPreference()

  const assignments = useBagAssignment(
    commitments.map((c) => ({
      id: c.id,
      quantity_kg: c.quantity_kg,
      created_at: c.created_at,
    })),
    bagSizeKg
  )
  const assignmentById = React.useMemo(() => {
    const map = new Map<string, { locked_kg: number; filling_kg: number }>()
    for (const a of assignments) {
      map.set(a.commitment_id, { locked_kg: a.locked_kg, filling_kg: a.filling_kg })
    }
    return map
  }, [assignments])

  const viewerCommits = React.useMemo(
    () => commitments.filter((c) => c.buyer_id === userId),
    [commitments, userId]
  )

  // kg remaining to finish the in-progress bag — derived from the campaign
  // total. When the total lands exactly on a bag boundary (or is zero),
  // no bag is filling, so we send `null` to suppress the "from completion"
  // suffix on the pill.
  const bagRemainingKg = React.useMemo<number | null>(() => {
    if (bagSizeKg <= 0) return null
    const leftover = totalCommittedKg % bagSizeKg
    if (leftover === 0) return null
    return bagSizeKg - leftover
  }, [bagSizeKg, totalCommittedKg])

  if (viewerCommits.length === 0) return null

  return (
    <section
      aria-label="Your commits on this lot"
      style={{
        background: 'var(--color-cream)',
        border: '4px solid var(--color-espresso)',
        borderRadius: 20,
        padding: '24px 28px 26px',
        boxShadow: '6px 6px 0 var(--color-espresso)',
        color: 'var(--color-espresso)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 18,
          flexWrap: 'wrap',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(28px, 3vw, 40px)',
            lineHeight: 0.92,
            textTransform: 'uppercase',
            color: 'var(--color-espresso)',
          }}
        >
          Your bags so far.
        </h2>
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.06em',
            color: 'var(--fg2)',
            maxWidth: 360,
            lineHeight: 1.5,
          }}
        >
          Filling kg refund if the bag doesn&apos;t complete by the deadline.
        </p>
      </div>

      <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, listStyle: 'none', padding: 0, margin: 0 }}>
        {viewerCommits.map((c) => {
          const split = assignmentById.get(c.id) ?? { locked_kg: 0, filling_kg: 0 }
          return (
            <li
              key={c.id}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                background: 'var(--color-chalk)',
                border: '3px solid var(--color-espresso)',
                borderRadius: 12,
                padding: '12px 16px',
                boxShadow: '3px 3px 0 var(--color-espresso)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 16,
                    fontWeight: 800,
                    fontVariantNumeric: 'tabular-nums',
                    color: 'var(--color-espresso)',
                  }}
                >
                  {formatUnitWeight(c.quantity_kg, unit, 1)} {unit}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 10.5,
                    fontWeight: 800,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--fg2)',
                  }}
                >
                  {new Date(c.created_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>
              <LockedFillingPill
                locked_kg={split.locked_kg}
                filling_kg={split.filling_kg}
                bag_remaining_kg={split.filling_kg > 0 ? bagRemainingKg : null}
              />
            </li>
          )
        })}
      </ul>
    </section>
  )
}

'use client'

import * as React from 'react'

import { assignKgToBags } from '@/lib/bag-assignment'
import type { BagAssignmentResult } from '@/lib/types'

type BagAssignmentCommitment = {
  id: string
  quantity_kg: number
  created_at: string
}

/**
 * Client-side wrapper around the pure `assignKgToBags` helper for use in
 * React components.
 *
 * Returns the Locked / Filling split per commitment for a campaign, using
 * the same chronological assignment rule as the server. When `bag_size_kg`
 * is `null` (legacy lot awaiting backfill) the hook returns an empty array
 * — callers should render a backfill prompt rather than bag-aware UI.
 *
 * The hook is pure with respect to its inputs and performs no I/O. It is
 * memoized by reference identity on `commitments` (not deep equality), so
 * callers must provide a stable input (e.g., the array returned by a
 * react-query result, props, or a value held in state).
 */
export function useBagAssignment(
  commitments: Array<BagAssignmentCommitment>,
  bag_size_kg: number | null,
): BagAssignmentResult[] {
  return React.useMemo(() => {
    if (bag_size_kg === null) return []
    return assignKgToBags({ commitments, bag_size_kg })
  }, [commitments, bag_size_kg])
}

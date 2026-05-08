'use client'

import * as React from 'react'
import { Card, CardContent } from '@merninos/ui'
import type { Lot } from '@/lib/types'

interface FarmerCardProps {
  lot: Lot
  hubName?: string | null
}

// Producer / farmer dossier. Pulls farm, seller, region, and origin out of
// the lot record. No portrait URL exists in the schema today — uses a
// brand initials chip as the visual anchor instead.
export function FarmerCard({ lot, hubName }: FarmerCardProps) {
  const sellerName = lot.seller?.contact_name ?? lot.seller?.company_name ?? lot.farm ?? null
  const initials = sellerName
    ? sellerName
        .split(/\s+/)
        .map((s) => s[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '☕'

  return (
    <Card className="flex flex-col gap-6 p-6 sm:p-8 sm:flex-row sm:items-start">
      <div
        aria-hidden
        className="flex h-24 w-24 shrink-0 items-center justify-center rounded-[20px] border-[4px] border-espresso bg-sun font-display text-4xl text-espresso shadow-flat-sm"
      >
        {initials}
      </div>
      <div className="flex flex-col gap-3">
        <span className="font-body text-xs font-bold uppercase tracking-[0.12em] text-espresso/60">
          Producer
        </span>
        <h3 className="font-headline text-3xl text-espresso leading-tight">
          {sellerName ?? 'Producer details coming soon'}
        </h3>
        <p className="font-body text-sm text-espresso/80 max-w-prose">
          {lot.farm && <strong className="font-bold">{lot.farm}</strong>}
          {lot.farm && (lot.region || lot.origin_country) && ' · '}
          {[lot.region, lot.origin_country].filter(Boolean).join(', ')}
          {hubName && (
            <>
              <br />
              Lot ships once to <strong className="font-bold">{hubName}</strong> for local pickup.
            </>
          )}
        </p>
      </div>
    </Card>
  )
}

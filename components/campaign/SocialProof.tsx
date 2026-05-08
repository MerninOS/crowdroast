'use client'

import * as React from 'react'
import { Card, Badge } from '@merninos/ui'

export type LeaderboardEntry = {
  displayName: string
  pounds: number
}

interface SocialProofProps {
  recentCommitCount: number
  leaderboard: LeaderboardEntry[]
}

// Pure presentational. Receives pre-fetched stats from the server route —
// no fetching, no realtime. V1 ships with a 24h commit count and a top-5
// leaderboard rendered server-side; the live activity marquee is deferred.
export function SocialProof({ recentCommitCount, leaderboard }: SocialProofProps) {
  return (
    <section
      data-section="social"
      className="grid gap-6 lg:grid-cols-[auto_1fr] lg:gap-8"
    >
      <Card className="flex flex-col items-start gap-3 p-6 sm:p-8 bg-tomato text-cream border-[4px]">
        <span className="font-body text-xs font-bold uppercase tracking-[0.12em]">
          Last 24 hours
        </span>
        <span className="font-display text-6xl sm:text-7xl leading-none">
          {recentCommitCount}
        </span>
        <span className="font-body text-base font-bold uppercase tracking-[0.08em]">
          {recentCommitCount === 1 ? 'roaster joined' : 'roasters joined'}
        </span>
      </Card>

      <Card className="flex flex-col gap-4 p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <h3 className="font-headline text-2xl text-espresso">Top of the campaign</h3>
          <Badge>Live</Badge>
        </div>
        {leaderboard.length === 0 ? (
          <p className="font-body text-sm text-espresso/70">
            No commits yet. Be the first one in.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {leaderboard.map((entry, idx) => (
              <li
                key={`${entry.displayName}-${idx}`}
                className="flex items-center gap-4 border-b-[2px] border-espresso/20 pb-3 last:border-b-0 last:pb-0"
              >
                <span
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[3px] border-espresso bg-sun font-display text-lg text-espresso"
                >
                  {idx + 1}
                </span>
                <span className="font-body font-bold text-espresso flex-1 truncate">
                  {entry.displayName}
                </span>
                <span className="font-body font-bold text-sm text-espresso/80 tabular-nums">
                  {entry.pounds.toLocaleString()} lb
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </section>
  )
}

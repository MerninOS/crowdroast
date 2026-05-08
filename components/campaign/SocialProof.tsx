'use client'

import * as React from 'react'
import { Leaderboard, type LeaderboardEntry } from './Leaderboard'
import { ActivityFeed, type ActivityItem } from './ActivityFeed'

interface SocialProofProps {
  /** Total recent commit count, surfaced in the section copy. */
  recentCommitCount: number
  leaderboard: LeaderboardEntry[]
  activity: ActivityItem[]
  /** Lot id slug for the section copy ("...this lot."). */
  lotIdShort: string
}

// Direct port of the leaderboard / activity section in
// design/project/campaign/App.jsx — eyebrow, big "Who's carrying this lot."
// headline, two-column grid with Leaderboard on the left and ActivityFeed
// on the right. The prototype's Roster avatar wall is omitted in V1
// because we don't carry buyer-color data through the route.
export function SocialProof({
  recentCommitCount,
  leaderboard,
  activity,
  lotIdShort,
}: SocialProofProps) {
  return (
    <section
      data-section="social"
      style={{
        padding: '56px 24px',
        background: 'var(--color-cream)',
      }}
    >
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ marginBottom: 32, maxWidth: 680 }}>
          <div
            className="eyebrow"
            style={{
              color: 'var(--color-tomato)',
              fontSize: 11,
              letterSpacing: '.18em',
              textTransform: 'uppercase',
              fontWeight: 800,
            }}
          >
            Heaviest hitters
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(36px, 4vw, 56px)',
              lineHeight: 0.92,
              textTransform: 'uppercase',
              margin: '6px 0 8px',
              color: 'var(--color-espresso)',
            }}
          >
            Who&apos;s carrying
            <br />
            this lot.
          </h2>
          <p
            style={{
              fontSize: 14,
              color: 'var(--fg2)',
              lineHeight: 1.55,
              margin: 0,
            }}
          >
            The roasters with the largest commits on Lot #{lotIdShort}. Their
            volume drives the next tier — yours could push it to stretch.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
            gap: 28,
            alignItems: 'flex-start',
          }}
          className="cp-social-grid"
        >
          <Leaderboard entries={leaderboard} />
          <ActivityFeed items={activity} totalCount={recentCommitCount} />
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .cp-social-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  )
}

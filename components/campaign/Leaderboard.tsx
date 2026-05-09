'use client'

import * as React from 'react'
import { useUnitPreference } from '@/components/unit-provider'
import { formatUnitWeight } from '@/lib/units'

export type LeaderboardEntry = {
  displayName: string
  city: string | null
  /** Total quantity for this buyer in kilograms. */
  kg: number
}

interface LeaderboardProps {
  entries: LeaderboardEntry[]
}

// Direct port of design/project/campaign/Social.jsx (Leaderboard).
// Top-3 entries get a colored medal + cream tint; remaining rows render
// with a dashed border. Ranks 1/2/3 use tomato/sun/honey medals.
export function Leaderboard({ entries }: LeaderboardProps) {
  const { unit } = useUnitPreference()
  return (
    <div
      style={{
        background: 'var(--color-chalk)',
        border: '4px solid var(--color-espresso)',
        borderRadius: 20,
        boxShadow: '6px 6px 0 var(--color-espresso)',
        padding: 18,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 26,
            textTransform: 'uppercase',
            lineHeight: 1,
          }}
        >
          Top of the lot
        </div>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '2px 10px',
            borderRadius: 9999,
            border: '2px solid var(--color-espresso)',
            background: 'var(--color-espresso)',
            color: 'var(--color-cream)',
            fontWeight: 800,
            fontSize: 9.5,
            letterSpacing: '.1em',
            textTransform: 'uppercase',
          }}
        >
          This week
        </span>
      </div>

      {entries.length === 0 ? (
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            color: 'var(--fg2)',
            margin: 0,
          }}
        >
          No commits yet. Be the first one in.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {entries.map((e, idx) => {
            const rank = idx + 1
            const medalColor =
              rank === 1
                ? 'var(--color-tomato)'
                : rank === 2
                  ? 'var(--color-sun)'
                  : rank === 3
                    ? 'var(--color-honey)'
                    : 'var(--color-fog)'
            const podium = rank <= 3
            return (
              <div
                key={`${e.displayName}-${idx}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  background: podium ? 'var(--color-cream)' : 'transparent',
                  border: podium
                    ? '2.5px solid var(--color-espresso)'
                    : '2px dashed var(--color-fog)',
                  borderRadius: 12,
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    background: medalColor,
                    border: '2.5px solid var(--color-espresso)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'var(--font-display)',
                    fontSize: 18,
                    color: rank === 1 ? 'var(--color-cream)' : 'var(--color-espresso)',
                    flexShrink: 0,
                  }}
                >
                  {rank}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: 14,
                      color: 'var(--color-espresso)',
                      lineHeight: 1.15,
                    }}
                  >
                    {e.displayName}
                  </div>
                  {e.city && (
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--fg2)',
                        fontWeight: 700,
                        marginTop: 2,
                      }}
                    >
                      {e.city}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 22,
                      lineHeight: 1,
                    }}
                  >
                    {formatUnitWeight(e.kg, unit, 0)}
                  </div>
                  <div
                    style={{
                      fontSize: 9.5,
                      fontWeight: 800,
                      letterSpacing: '.1em',
                      textTransform: 'uppercase',
                      color: 'var(--fg2)',
                    }}
                  >
                    {unit} in
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

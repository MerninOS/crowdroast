'use client'

import * as React from 'react'

export type ActivityItem = {
  id: string
  displayName: string
  city: string | null
  pounds: number
  ago: string
}

interface ActivityFeedProps {
  items: ActivityItem[]
  /** Total roasters in the campaign, shown in the header pill. */
  totalCount: number
}

// Direct port of design/project/campaign/Social.jsx (ActivityFeed).
// Espresso header bar with a pulsing matcha dot, scrollable list of
// recent commits with rotating avatar colors, dashed dividers between
// rows. The data is server-rendered (not realtime) but the visual
// energy is preserved — the dot pulses for ambient liveliness.
export function ActivityFeed({ items, totalCount }: ActivityFeedProps) {
  return (
    <div
      style={{
        background: 'var(--color-chalk)',
        border: '4px solid var(--color-espresso)',
        borderRadius: 20,
        boxShadow: '6px 6px 0 var(--color-espresso)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          background: 'var(--color-espresso)',
          color: 'var(--color-cream)',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: 'var(--color-matcha)',
              animation: 'cp-pulse 1.4s ease-in-out infinite',
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 800,
              fontSize: 11,
              letterSpacing: '.14em',
              textTransform: 'uppercase',
            }}
          >
            Recent · Roasters joining
          </span>
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '.1em',
            textTransform: 'uppercase',
            color: 'var(--color-sun)',
          }}
        >
          {totalCount} in
        </span>
      </div>

      <div style={{ maxHeight: 340, overflowY: 'auto' }}>
        {items.length === 0 ? (
          <div
            style={{
              padding: '16px',
              fontSize: 13,
              color: 'var(--fg2)',
            }}
          >
            No commits yet today.
          </div>
        ) : (
          items.map((it, i) => {
            const colors = [
              'var(--color-tomato)',
              'var(--color-honey)',
              'var(--color-sky)',
              'var(--color-matcha)',
              'var(--color-sun)',
            ]
            const initials = it.displayName
              .split(/\s+/)
              .map((w) => w[0])
              .filter(Boolean)
              .slice(0, 2)
              .join('')
            return (
              <div
                key={it.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  borderBottom:
                    i < items.length - 1 ? '2px dashed var(--color-fog)' : 'none',
                }}
              >
                <div
                  aria-hidden
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 999,
                    background: colors[i % colors.length],
                    border: '2.5px solid var(--color-espresso)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'var(--font-body)',
                    fontWeight: 900,
                    fontSize: 11,
                    letterSpacing: '.04em',
                    color: 'var(--color-espresso)',
                    flexShrink: 0,
                  }}
                >
                  {initials || '☕'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: 13.5,
                      color: 'var(--color-espresso)',
                      lineHeight: 1.2,
                    }}
                  >
                    {it.displayName}{' '}
                    <span style={{ color: 'var(--fg2)', fontWeight: 600 }}>
                      committed{' '}
                      <b style={{ color: 'var(--color-tomato)' }}>
                        {it.pounds.toLocaleString()} lb
                      </b>
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--fg2)',
                      fontWeight: 700,
                      letterSpacing: '.04em',
                      marginTop: 2,
                    }}
                  >
                    {it.city ? `${it.city} · ` : ''}
                    {it.ago} ago
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

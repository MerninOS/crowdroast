'use client'

import * as React from 'react'

interface CountdownProps {
  /** ISO timestamp — the campaign close time. Null hides the countdown. */
  deadline: string | null | undefined
}

// Boxed-cell countdown — espresso-background tiles with sun-colored
// display-font numbers and tiny uppercase labels underneath. Direct port
// of the prototype's Countdown in design/project/campaign/App.jsx, with
// the readout driven by a real ISO timestamp instead of hardcoded mins.
export function Countdown({ deadline }: CountdownProps) {
  const [now, setNow] = React.useState<number>(() => Date.now())

  React.useEffect(() => {
    if (!deadline) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [deadline])

  if (!deadline) return null
  const target = Date.parse(deadline)
  if (Number.isNaN(target)) return null

  const diff = target - now
  if (diff <= 0) {
    return (
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 26,
          lineHeight: 1,
          color: 'var(--color-tomato)',
          textTransform: 'uppercase',
        }}
      >
        Campaign closed
      </span>
    )
  }

  const seconds = Math.floor((diff / 1000) % 60)
  const minutes = Math.floor((diff / 1000 / 60) % 60)
  const hours = Math.floor((diff / 1000 / 60 / 60) % 24)
  const days = Math.floor(diff / 1000 / 60 / 60 / 24)

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
      <Cell label="Days" value={days} />
      <Cell label="Hrs" value={hours} />
      <Cell label="Min" value={minutes} />
      <Cell label="Sec" value={seconds} />
    </div>
  )
}

function Cell({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          background: 'var(--color-espresso)',
          color: 'var(--color-sun)',
          border: '3px solid var(--color-espresso)',
          borderRadius: 10,
          padding: '6px 0',
          minWidth: 48,
          fontFamily: 'var(--font-display)',
          fontSize: 26,
          lineHeight: 1,
        }}
      >
        {String(value).padStart(2, '0')}
      </div>
      <div
        style={{
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: '.14em',
          textTransform: 'uppercase',
          color: 'var(--fg2)',
          marginTop: 5,
        }}
      >
        {label}
      </div>
    </div>
  )
}

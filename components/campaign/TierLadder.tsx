'use client'

import * as React from 'react'
import { TierBar, Stepper, Starburst, type StepperStep, type TierBarTick } from '@merninos/ui'

export type TierLadderStep = StepperStep

interface TierLadderProps {
  /** Total pounds committed to date. */
  committedPounds: number
  /** Pounds at which the next tier unlocks. 0 means the top tier is reached. */
  nextTierThreshold: number
  /** Label of the tier the campaign is currently in. */
  currentTierLabel: string
  /** Label of the tier just above current. Null when the top tier is reached. */
  nextTierLabel?: string | null
  /** Stepper flag list — order matches campaign progression. */
  steps: TierLadderStep[]
  /** Which step the campaign is currently on. */
  currentStepKey: string
  /** Optional tick marks to overlay on the progress bar (positions in pounds). */
  ticks?: TierBarTick[]
  /** ISO timestamp when committing closes — drives the D:H:M:S countdown. */
  commitmentDeadline?: string | null
  /** Slot for a nested StickyInvitePoke. */
  children?: React.ReactNode
}

// Excitement engine: stepper flags + progress bar + Starburst callout +
// live countdown. Section is given min-height: 80vh on lg+ so the nested
// StickyCta has scroll runway to actually stick to.
//
// Progress bar fill = committedPounds / nextTierThreshold per spec
// criterion #1. When the top tier is reached (threshold = 0), we render
// a celebratory state instead of a divide-by-zero bar.
export function TierLadder({
  committedPounds,
  nextTierThreshold,
  currentTierLabel,
  nextTierLabel,
  steps,
  currentStepKey,
  ticks,
  commitmentDeadline,
  children,
}: TierLadderProps) {
  const atTopTier = nextTierThreshold <= 0 || !nextTierLabel
  const remaining = atTopTier ? 0 : Math.max(0, nextTierThreshold - committedPounds)
  const countdown = useCountdown(commitmentDeadline)

  return (
    <section
      data-section="tier"
      className="flex flex-col gap-8 rounded-[24px] border-[5px] border-espresso bg-cream p-6 sm:p-10 lg:min-h-[80vh] lg:p-12 shadow-[8px_8px_0_var(--mernin-espresso,#1C0F05)]"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
        <div className="flex flex-col gap-1">
          <span className="font-body text-xs font-bold uppercase tracking-[0.12em] text-espresso/60">
            Currently in
          </span>
          <h2 className="font-headline text-4xl sm:text-5xl text-espresso leading-tight">
            {currentTierLabel}
          </h2>
        </div>

        <div className="flex flex-col items-start gap-1 sm:items-end">
          <span className="font-body text-xs font-bold uppercase tracking-[0.12em] text-espresso/60">
            Campaign closes in
          </span>
          <CountdownReadout countdown={countdown} />
        </div>
      </header>

      <Stepper steps={steps} currentKey={currentStepKey} />

      {atTopTier ? (
        <div className="flex items-center gap-6">
          <Starburst label="Stretch!" color="tomato" size={120} />
          <div>
            <h3 className="font-headline text-3xl text-espresso leading-tight">
              Top tier unlocked.
            </h3>
            <p className="font-body text-sm text-espresso/70">
              Every commit from here builds the stretch goal.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <TierBar
            value={committedPounds}
            max={nextTierThreshold}
            ticks={ticks}
            variant="tomato"
          />
          <div className="flex items-center gap-6">
            <Starburst
              label={`${remaining.toLocaleString()} lb`}
              color="sun"
              size={110}
            />
            <p className="font-headline text-2xl sm:text-3xl text-espresso leading-tight">
              to unlock <strong className="font-display">{nextTierLabel}</strong>
            </p>
          </div>
        </div>
      )}

      {children && <div className="mt-2">{children}</div>}
    </section>
  )
}

// ─── Countdown ────────────────────────────────────────────────────────────────

type Countdown =
  | { kind: 'live'; days: number; hours: number; minutes: number; seconds: number }
  | { kind: 'closed' }
  | { kind: 'idle' }

function useCountdown(deadline: string | null | undefined): Countdown {
  const [now, setNow] = React.useState<number>(() => Date.now())

  React.useEffect(() => {
    if (!deadline) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [deadline])

  if (!deadline) return { kind: 'idle' }
  const target = Date.parse(deadline)
  if (Number.isNaN(target)) return { kind: 'idle' }
  const diff = target - now
  if (diff <= 0) return { kind: 'closed' }
  const seconds = Math.floor((diff / 1000) % 60)
  const minutes = Math.floor((diff / 1000 / 60) % 60)
  const hours = Math.floor((diff / 1000 / 60 / 60) % 24)
  const days = Math.floor(diff / 1000 / 60 / 60 / 24)
  return { kind: 'live', days, hours, minutes, seconds }
}

function CountdownReadout({ countdown }: { countdown: Countdown }) {
  if (countdown.kind === 'idle') return null
  if (countdown.kind === 'closed') {
    return (
      <span className="font-display text-2xl sm:text-3xl text-tomato">
        Campaign closed
      </span>
    )
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    <span className="font-display text-3xl sm:text-4xl text-espresso tabular-nums">
      {countdown.days}d {pad(countdown.hours)}:{pad(countdown.minutes)}:{pad(countdown.seconds)}
    </span>
  )
}

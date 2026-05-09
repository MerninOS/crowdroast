'use client'

import * as React from 'react'

export type InviteData = {
  code: string
  url: string
  hubName: string
  hubCity: string | null
}

export type InviteDataStatus = 'loading' | 'ready' | 'no-hub' | 'error'

export type InviteDataContextValue = {
  data: InviteData | null
  status: InviteDataStatus
}

const InviteDataContext = React.createContext<InviteDataContextValue | null>(null)

// Fetches the buyer's invite link exactly once per mount and shares the
// result with every consumer below it via React context. The four campaign-
// page invite CTAs (sticky, banner, FAB, post-commit nudge) all read from
// here — none fetch independently — so POST /api/invite-codes is hit once
// regardless of how many CTAs the user interacts with.
//
// Status semantics:
//   'loading' — fetch in flight (initial state)
//   'ready'   — buyer has an invite link; CTAs render
//   'no-hub'  — buyer is not in a hub (API 403); CTAs hide themselves,
//               matching the existing InviteShareCard contract
//   'error'   — network failure or non-403 error; modal can show an
//               error state if the user got past the hidden-CTA gate
export function InviteDataProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<InviteDataContextValue>({
    data: null,
    status: 'loading',
  })

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/invite-codes', { method: 'POST' })
        if (cancelled) return
        if (!res.ok) {
          setState({
            data: null,
            status: res.status === 403 ? 'no-hub' : 'error',
          })
          return
        }
        const body = (await res.json()) as InviteData
        setState({ data: body, status: 'ready' })
      } catch {
        if (!cancelled) setState({ data: null, status: 'error' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <InviteDataContext.Provider value={state}>
      {children}
    </InviteDataContext.Provider>
  )
}

export function useInviteData(): InviteDataContextValue {
  const ctx = React.useContext(InviteDataContext)
  if (ctx === null) {
    throw new Error('useInviteData must be used inside <InviteDataProvider>')
  }
  return ctx
}

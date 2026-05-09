'use client'

import * as React from 'react'

const DESKTOP_BREAKPOINT = 1024

// Returns true when viewport is >= 1024px. Always returns false during SSR
// and on first client render before the matchMedia effect runs — this is
// intentional: consumers that want a desktop-only DOM element (e.g., the
// invite FAB) can return null when this is false, giving us a true
// DOM-absence assertion in tests on mobile viewports rather than a hidden
// element that string-matches as present.
export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = React.useState<boolean>(false)

  React.useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`)
    const onChange = () => setIsDesktop(mql.matches)
    mql.addEventListener('change', onChange)
    setIsDesktop(mql.matches)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isDesktop
}

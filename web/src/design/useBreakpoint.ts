import { useEffect, useState } from 'react'
import { breakpointForWidth, isLaptopWidth, LAPTOP_MIN_WIDTH, type Breakpoint } from './breakpoints'

// useBreakpoint (M09.3 S1) exposes the current responsive breakpoint to React
// components that need to branch in JS rather than CSS — e.g. rendering a Sheet
// on mobile but a modal on laptop (S3). Layout that can be expressed purely in
// CSS should prefer media queries (layout.css) over this hook.
//
// SSR/test-safe: when `window` is unavailable the hook assumes the laptop
// layout (the comfortable default) and never touches the DOM.

function readWidth(): number {
  if (typeof window === 'undefined') return LAPTOP_MIN_WIDTH
  return window.innerWidth
}

// useViewportWidth tracks window.innerWidth, updating on resize. Both public
// hooks derive from it so there is a single resize listener and no drift.
function useViewportWidth(): number {
  const [width, setWidth] = useState<number>(readWidth)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    // Sync once on mount in case the width changed before the listener attached.
    onResize()
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return width
}

/** Returns the current named breakpoint, updating on resize. */
export function useBreakpoint(): Breakpoint {
  return breakpointForWidth(useViewportWidth())
}

/** Convenience: true when the current viewport uses the laptop layout. */
export function useIsLaptop(): boolean {
  return isLaptopWidth(useViewportWidth())
}

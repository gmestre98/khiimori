// Responsive breakpoint system (M09.3 S1).
//
// One codebase serves both a comfortable laptop layout and a purpose-built
// mobile layout (PRD §7.2, §5.10). These constants are the single source of
// truth for the breakpoints; the matching pixel values are mirrored in the
// layout CSS media queries (components/layout/layout.css). Keep them in sync.
//
// Three named ranges:
//   - mobile:  < 640px   — purpose-built mobile layout (bottom nav, thumb zones)
//   - tablet:  640–1023px — midpoint; uses the mobile layout with more breathing room
//   - laptop:  ≥ 1024px   — comfortable laptop layout (sidebar nav)

export type Breakpoint = 'mobile' | 'tablet' | 'laptop'

/** Minimum pixel width (inclusive) at which each named breakpoint begins. */
export const BREAKPOINTS: Record<Breakpoint, number> = {
  mobile: 0,
  tablet: 640,
  laptop: 1024,
}

/**
 * The width (px) at and above which the comfortable laptop layout is used.
 * Below it, the purpose-built mobile layout (bottom nav, thumb zones) is used.
 */
export const LAPTOP_MIN_WIDTH = BREAKPOINTS.laptop

/** `matchMedia` query strings for each layout mode. */
export const MEDIA_QUERIES = {
  /** Mobile + tablet — the purpose-built mobile layout. */
  mobile: `(max-width: ${BREAKPOINTS.laptop - 1}px)`,
  /** Tablet midpoint only. */
  tablet: `(min-width: ${BREAKPOINTS.tablet}px) and (max-width: ${BREAKPOINTS.laptop - 1}px)`,
  /** Laptop and wider — the comfortable laptop layout. */
  laptop: `(min-width: ${BREAKPOINTS.laptop}px)`,
} as const

/** Resolve a viewport width (px) to its named breakpoint. */
export function breakpointForWidth(width: number): Breakpoint {
  if (width >= BREAKPOINTS.laptop) return 'laptop'
  if (width >= BREAKPOINTS.tablet) return 'tablet'
  return 'mobile'
}

/** True when the width should use the comfortable laptop layout. */
export function isLaptopWidth(width: number): boolean {
  return width >= LAPTOP_MIN_WIDTH
}

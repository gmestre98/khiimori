// Country colours are meaning only: a day's date-box border, a segment of the
// route strip and a map pin all share the colour of the country that day is in.
//
// The colours are CSS custom properties (tokens.css) so dark mode can lighten
// them for contrast. Three countries have fixed, named colours from the design
// spec; any other country gets a stable slot from a small palette keyed by a
// hash of its name, so the same country always reads the same colour.

const NAMED: Record<string, string> = {
  senegal: 'var(--country-sn)',
  'the gambia': 'var(--country-gm)',
  gambia: 'var(--country-gm)',
  mauritania: 'var(--country-mr)',
}

const PALETTE = [
  'var(--country-1)',
  'var(--country-2)',
  'var(--country-3)',
  'var(--country-4)',
  'var(--country-5)',
  'var(--country-6)',
]

export const NO_COUNTRY_COLOR = 'var(--country-none)'

// hash is a tiny, stable string hash (djb2) — enough to spread names across
// the palette deterministically.
function hash(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h
}

// countryColor returns the CSS colour (a var(--country-…) reference) for a
// place name. Empty → the neutral "unknown" colour.
export function countryColor(name: string | null | undefined): string {
  const key = (name ?? '').trim().toLowerCase()
  if (!key) return NO_COUNTRY_COLOR
  return NAMED[key] ?? PALETTE[hash(key) % PALETTE.length]
}

// colorForIndex picks a palette colour by position — used where there is no
// country name to key on (e.g. a trip's n-th destination).
export function colorForIndex(i: number): string {
  return PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length]
}

// resolveCssColor turns a var(--token) reference into a concrete colour string
// for consumers that cannot read CSS variables (Leaflet divIcon inline styles
// still can; SVG strokes on canvas cannot). Falls back to the input.
export function resolveCssColor(value: string): string {
  const m = /^var\((--[a-z0-9-]+)\)$/i.exec(value)
  if (!m || typeof window === 'undefined' || typeof document === 'undefined') return value
  const v = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim()
  return v || value
}

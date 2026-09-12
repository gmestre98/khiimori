// Continent tags for a trip. A trip's continent is user-set (there's no reliable
// way to derive it from the free-text destination list), stored as a stable
// lowercase slug, and "" when unset. The slug set here mirrors the backend
// validContinents map and the trip.trips.continent DB CHECK exactly — the three
// must be changed together.

// ContinentSlug is one of the fixed continent slugs, or "" for unset.
export type ContinentSlug =
  | ''
  | 'africa'
  | 'antarctica'
  | 'asia'
  | 'europe'
  | 'north_america'
  | 'oceania'
  | 'south_america'

// CONTINENTS lists the selectable continents in the order they appear in the
// trip form and the Past-trips filter, most-travelled first (Antarctica last).
export const CONTINENTS: { slug: ContinentSlug; label: string }[] = [
  { slug: 'europe', label: 'Europe' },
  { slug: 'asia', label: 'Asia' },
  { slug: 'north_america', label: 'North America' },
  { slug: 'south_america', label: 'South America' },
  { slug: 'africa', label: 'Africa' },
  { slug: 'oceania', label: 'Oceania' },
  { slug: 'antarctica', label: 'Antarctica' },
]

const LABELS: Record<string, string> = Object.fromEntries(CONTINENTS.map((c) => [c.slug, c.label]))

// continentLabel returns the display name for a continent slug, or "" for an
// unset/unknown value (so callers can treat it as "no continent").
export function continentLabel(slug: string | undefined): string {
  if (!slug) return ''
  return LABELS[slug] ?? ''
}

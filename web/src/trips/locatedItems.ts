import type { Day } from '../lib/api'

// LocatedItem pairs an entity id (PlanItem.id or Stay.id) with its display
// label and location string. Used to correlate map pins with list items.
export interface LocatedItem {
  id: string
  label: string
  location: string
}

// collectLocatedItems returns stays then plan items (by sort_order) that have a
// non-empty location, in the same order passed to fetchDayRoute. Used by both
// the map (pin legend) and the planning list (pin badges).
export function collectLocatedItems(day: Pick<Day, 'stays' | 'plan_items'>): LocatedItem[] {
  const stays: LocatedItem[] = (day.stays ?? [])
    .filter((s) => s.location)
    .map((s) => ({ id: s.id, label: s.name, location: s.location! }))
  const items: LocatedItem[] = [...(day.plan_items ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .filter((i) => i.location)
    .map((i) => ({ id: i.id, label: i.title, location: i.location! }))
  return [...stays, ...items]
}

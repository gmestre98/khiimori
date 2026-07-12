import type { Day } from '../lib/api'

// LocatedItem pairs an entity id (PlanItem.id or Stay.id) with its display
// label and location string. Used to correlate map pins with list items.
// `done` marks whether the thing actually happened — a done plan item, or a stay
// (you slept there) — so the map can render what didn't happen more faintly.
export interface LocatedItem {
  id: string
  label: string
  location: string
  done: boolean
}

// collectLocatedItems returns stays then plan items (by sort_order) that have a
// non-empty location, in the same order passed to fetchDayRoute. Used by both
// the map (pin legend) and the planning list (pin badges).
export function collectLocatedItems(day: Pick<Day, 'stays' | 'plan_items'>): LocatedItem[] {
  const stays: LocatedItem[] = (day.stays ?? [])
    .filter((s) => s.location)
    .map((s) => ({ id: s.id, label: s.name, location: s.location!, done: true }))
  const items: LocatedItem[] = [...(day.plan_items ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .filter((i) => i.location)
    .map((i) => ({ id: i.id, label: i.title, location: i.location!, done: i.status === 'done' }))
  return [...stays, ...items]
}

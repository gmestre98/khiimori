import type { Day, PlanItem, Stay } from '../lib/api'
import { bookingOfItem, bookingOfStay } from './booking'

export type UnpaidRow =
  | { kind: 'stay'; stay: Stay; date: string; sub: string; cost: number | null }
  | { kind: 'item'; item: PlanItem; date: string; sub: string; cost: number | null }

function shortDay(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })
}

// unpaidRows lists what's booked but not paid yet: stays and plan items set to
// Booked, not in a package, and (for plan items) not done, skipped or
// cancelled — done means it was paid on the spot.
export function unpaidRows(
  dates: string[],
  days: (Day | null)[],
  inPackage: { stay: (id: string) => boolean; item: (id: string) => boolean },
): UnpaidRow[] {
  const rows: UnpaidRow[] = []
  const seenStays = new Set<string>()
  days.forEach((day, i) => {
    if (!day) return
    const date = dates[i]
    for (const stay of day.stays) {
      if (seenStays.has(stay.id)) continue
      seenStays.add(stay.id)
      if (bookingOfStay(stay) !== 'booked' || inPackage.stay(stay.id)) continue
      const range =
        stay.check_in && stay.check_out
          ? `${shortDay(stay.check_in)} – ${shortDay(stay.check_out)}`
          : shortDay(date)
      rows.push({ kind: 'stay', stay, date, sub: `Stay · ${range}`, cost: stay.cost ?? null })
    }
    for (const item of day.plan_items) {
      if ((item.kind ?? 'activity') === 'note') continue
      if (['done', 'skipped', 'cancelled'].includes(item.status)) continue
      if (bookingOfItem(item) !== 'booked' || inPackage.item(item.id)) continue
      const sub = [shortDay(date), item.type].filter(Boolean).join(' · ')
      rows.push({ kind: 'item', item, date, sub, cost: item.cost ?? null })
    }
  })
  return rows
}

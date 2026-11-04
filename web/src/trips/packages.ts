import { useEffect, useState } from 'react'
import { fetchPackages, UnauthorizedError, type Day, type TripPackage } from '../lib/api'
import { cacheKeys } from '../lib/cacheKeys'
import { readCache, writeCache } from '../lib/resourceCache'

// A tiny shared store of each trip's packages, so the Money tab, the day screen,
// its rows and the details sheet all see the same list and update together when
// one of them changes it. Loaded cache-first, then revalidated.

const lists = new Map<string, TripPackage[]>()
const listeners = new Map<string, Set<(list: TripPackage[]) => void>>()
const loading = new Map<string, Promise<void>>()

function notify(tripId: string, list: TripPackage[]) {
  lists.set(tripId, list)
  void writeCache(cacheKeys.packages(tripId), list)
  listeners.get(tripId)?.forEach((fn) => fn(list))
}

// setPackages replaces a trip's package list everywhere (after a local change).
export function setPackages(tripId: string, list: TripPackage[]): void {
  notify(tripId, list)
}

// upsertPackage adds or replaces one package everywhere.
export function upsertPackage(tripId: string, pkg: TripPackage): void {
  const cur = lists.get(tripId) ?? []
  const next = cur.some((p) => p.id === pkg.id)
    ? cur.map((p) => (p.id === pkg.id ? pkg : p))
    : [...cur, pkg].sort((a, b) => a.start_date.localeCompare(b.start_date))
  notify(tripId, next)
}

// removePackage drops one package everywhere.
export function removePackage(tripId: string, id: string): void {
  notify(
    tripId,
    (lists.get(tripId) ?? []).filter((p) => p.id !== id),
  )
}

// refreshPackages reloads a trip's packages from the server (one request at a
// time per trip); failures keep whatever is already shown.
export function refreshPackages(tripId: string): Promise<void> {
  const inflight = loading.get(tripId)
  if (inflight) return inflight
  const p = fetchPackages(tripId)
    .then((list) => notify(tripId, list))
    .catch((err: unknown) => {
      if (err instanceof UnauthorizedError) return
    })
    .finally(() => loading.delete(tripId))
  loading.set(tripId, p)
  return p
}

// usePackages returns a trip's packages (null until first known) and keeps the
// component in sync with every change made elsewhere.
export function usePackages(tripId: string | undefined): TripPackage[] | null {
  const [list, setList] = useState<TripPackage[] | null>(() =>
    tripId ? (lists.get(tripId) ?? null) : null,
  )
  useEffect(() => {
    if (!tripId) return
    let alive = true
    const fn = (l: TripPackage[]) => {
      if (alive) setList(l)
    }
    const set = listeners.get(tripId) ?? new Set()
    set.add(fn)
    listeners.set(tripId, set)
    if (!lists.has(tripId)) {
      void readCache<TripPackage[]>(cacheKeys.packages(tripId)).then((cached) => {
        if (cached && !lists.has(tripId)) {
          lists.set(tripId, cached.data)
          fn(cached.data)
        }
        void refreshPackages(tripId)
      })
    } else {
      fn(lists.get(tripId)!)
    }
    return () => {
      alive = false
      set.delete(fn)
    }
  }, [tripId])
  return list
}

// --- Pure helpers ----------------------------------------------------------------

// packageForDate is the package whose days include date, if any.
export function packageForDate(list: TripPackage[] | null, date: string): TripPackage | undefined {
  return list?.find((p) => p.start_date <= date && date <= p.end_date)
}

// packageForStay / packageForItem: the package covering that stay / plan item.
export function packageForStay(list: TripPackage[] | null, id: string): TripPackage | undefined {
  return list?.find((p) => p.stay_ids.includes(id))
}
export function packageForItem(list: TripPackage[] | null, id: string): TripPackage | undefined {
  return list?.find((p) => p.plan_item_ids.includes(id))
}

// packageDay is the 1-based day of date within the package, and how many it has.
export function packageDay(pkg: TripPackage, date: string): { day: number; of: number } {
  const ms = (d: string) => new Date(d + 'T00:00:00').getTime()
  return {
    day: Math.round((ms(date) - ms(pkg.start_date)) / 86_400_000) + 1,
    of: Math.round((ms(pkg.end_date) - ms(pkg.start_date)) / 86_400_000) + 1,
  }
}

// isPaid: the whole price has been paid.
export function isPaid(pkg: TripPackage): boolean {
  return pkg.paid_amount >= pkg.total_cost
}

export const INCLUDE_LABELS: Record<string, string> = {
  beds: 'Beds',
  transport: 'Transport',
  meals: 'Meals',
  guide: 'Guide',
  fees: 'Entry fees',
  activities: 'Activities',
  flights: 'Flights',
}

// packageTestReset clears the shared store (tests only).
export function packageTestReset(): void {
  lists.clear()
  listeners.clear()
  loading.clear()
}

// A row in the "what it covers" step: a stay or a plan item on one of the
// package's days.
export interface CoverRow {
  key: string
  kind: 'stay' | 'plan_item'
  id: string
  title: string
  tag: string
}

export interface CoverDay {
  date: string
  label: string
  rows: CoverRow[]
}

// coverDays lists, for each date in [start, end], the stays (once, on their
// first night in range) and the plan items (notes left out) of that day.
export function coverDays(
  dates: string[],
  days: (Day | null)[] | null | undefined,
  start: string,
  end: string,
): CoverDay[] {
  if (!days) return []
  const seenStays = new Set<string>()
  const out: CoverDay[] = []
  dates.forEach((date, i) => {
    if (date < start || date > end) return
    const day = days[i]
    if (!day) return
    const rows: CoverRow[] = []
    for (const s of day.stays ?? []) {
      if (seenStays.has(s.id)) continue
      seenStays.add(s.id)
      rows.push({ key: `stay:${s.id}`, kind: 'stay', id: s.id, title: s.name, tag: 'Stay' })
    }
    for (const it of day.plan_items ?? []) {
      const kind = it.kind ?? 'activity'
      if (kind === 'note' || it.unplanned) continue
      rows.push({
        key: `item:${it.id}`,
        kind: 'plan_item',
        id: it.id,
        title: it.title,
        tag: kind === 'transport' ? 'Transport' : kind === 'food' ? 'Food' : 'Activity',
      })
    }
    if (rows.length > 0) {
      out.push({
        date,
        label: new Date(date + 'T00:00:00').toLocaleDateString('en-GB', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        }),
        rows,
      })
    }
  })
  return out
}

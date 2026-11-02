import { useEffect, useState } from 'react'
import { UnauthorizedError, datesInRange, fetchDay, type Day, type Trip } from '../lib/api'
import { readCache, writeCache } from '../lib/resourceCache'
import { cacheKeys } from '../lib/cacheKeys'
import { countryColor, NO_COUNTRY_COLOR } from '../design/countries'
import { coversDay } from './stayCoverage'

// ── Pure helpers ────────────────────────────────────────────────────────────

// dayHasPlans: a day "has plans" when it carries any plan item. A stay alone
// doesn't count — a bed for the night is not a plan for the day.
export function dayHasPlans(day: Pick<Day, 'plan_items'>): boolean {
  return day.plan_items.some((i) => !i.unplanned)
}

// firstLocation returns the first place a day mentions: its stay's location,
// else the first plan item's location (or a transport leg's destination).
export function firstLocation(day: Pick<Day, 'stays' | 'plan_items'>): string {
  const stay = day.stays.find((s) => s.location?.trim())
  if (stay?.location) return stay.location.trim()
  const items = [...day.plan_items].sort((a, b) => a.sort_order - b.sort_order)
  for (const i of items) {
    const loc = (i.location || i.destination || i.origin || '').trim()
    if (loc) return loc
  }
  return ''
}

// placeName is the short, human place for a day — the first comma segment of
// its first location ("Plateau, Dakar, Senegal" → "Plateau").
export function placeName(location: string): string {
  return location.split(',')[0]?.trim() ?? ''
}

// countryOf guesses the country from a free-text location: the last comma
// segment ("Gorée, Dakar, Senegal" → "Senegal"). A single-segment location
// ("Dakar") carries no country, so it returns '' and the caller falls back to
// the neighbouring days' country (or the neutral colour).
export function countryOf(location: string): string {
  const parts = location
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  return parts.length > 1 ? parts[parts.length - 1] : ''
}

export interface DayMeta {
  date: string
  index: number
  day: Day | null
  hasPlans: boolean
  // place is the day's automatic name (its first location); title is what to
  // show: the traveller's own title when set, otherwise the place.
  place: string
  title: string
  country: string
  color: string
}

// buildDayMetas derives, for every trip date, the place, country and country
// colour. A day with no located content inherits the previous day's country,
// so a run of unplanned days in the same country keeps its colour (drawn
// dashed by the date box) rather than flickering to grey.
export function buildDayMetas(dates: string[], days: (Day | null)[]): DayMeta[] {
  let carry = ''
  return dates.map((date, index) => {
    // Guard against a malformed payload (e.g. an error body) so one bad day
    // can't break the whole list.
    const raw = days[index] ?? null
    const day = raw && Array.isArray(raw.plan_items) && Array.isArray(raw.stays) ? raw : null
    const loc = day ? firstLocation(day) : ''
    const country = (loc ? countryOf(loc) : '') || carry
    if (country) carry = country
    return {
      date,
      index,
      day,
      hasPlans: day ? dayHasPlans(day) : false,
      place: placeName(loc),
      title: day?.title?.trim() || placeName(loc),
      country,
      color: country ? countryColor(country) : NO_COUNTRY_COLOR,
    }
  })
}

// routeSegments groups consecutive days that share a colour into strip
// segments (for the dashboard / days-page route strip).
export function routeSegments(
  metas: DayMeta[],
): { color: string; days: number; country: string }[] {
  const out: { color: string; days: number; country: string }[] = []
  for (const m of metas) {
    const last = out[out.length - 1]
    if (last && last.color === m.color) last.days++
    else out.push({ color: m.color, days: 1, country: m.country })
  }
  return out
}

// planSummary is the one-line summary under a day row: the first plans
// "+ N more", else the stay, else empty.
export function planSummary(day: Day): string {
  const planned = [...day.plan_items]
    .filter((i) => !i.unplanned)
    .sort((a, b) => a.sort_order - b.sort_order)
  if (planned.length > 0) {
    const shown = planned.slice(0, 2).map((i) => i.title)
    const more = planned.length - shown.length
    return shown.join(', ') + (more > 0 ? ` + ${more} more` : '')
  }
  const stay = day.stays[0]
  return stay ? `Staying at ${stay.name}` : ''
}

// ── Stays ───────────────────────────────────────────────────────────────────

// nightOf reports "night x of y" for a dated stay on a given date.
export function nightOf(
  stay: { check_in?: string; check_out?: string },
  date: string,
): { night: number; total: number } | null {
  if (!stay.check_in || !stay.check_out) return null
  const ms = (s: string) => Date.parse(`${s}T00:00:00Z`)
  const total = Math.round((ms(stay.check_out) - ms(stay.check_in)) / 86_400_000)
  const night = Math.round((ms(date) - ms(stay.check_in)) / 86_400_000) + 1
  if (total <= 0 || night < 1 || night > total) return null
  return { night, total }
}

export interface StayRun {
  kind: 'stay' | 'gap'
  // Stay rows: the stay; gap rows: null.
  stay: Day['stays'][number] | null
  start: string
  // Inclusive last night.
  end: string
  nights: number
}

// stayRuns walks the trip's nights in order and returns the bases (stays) and
// the gaps — nights with no stay — between them. The last trip date is not a
// night (you leave that day), so a trip of N days has N-1 nights.
export function stayRuns(dates: string[], days: (Day | null)[]): StayRun[] {
  const runs: StayRun[] = []
  for (let i = 0; i < dates.length - 1; i++) {
    const date = dates[i]
    const day = days[i]
    const stay = day?.stays.find((s) => coversDay(s, date)) ?? null
    const last = runs[runs.length - 1]
    if (stay) {
      const same =
        last &&
        last.kind === 'stay' &&
        last.stay &&
        (last.stay.id === stay.id ||
          (last.stay.name === stay.name &&
            last.stay.check_in === stay.check_in &&
            last.stay.check_out === stay.check_out))
      if (same) {
        last.end = date
        last.nights++
      } else {
        runs.push({ kind: 'stay', stay, start: date, end: date, nights: 1 })
      }
    } else if (last && last.kind === 'gap') {
      last.end = date
      last.nights++
    } else {
      runs.push({ kind: 'gap', stay: null, start: date, end: date, nights: 1 })
    }
  }
  return runs
}

// ── Loader ──────────────────────────────────────────────────────────────────

export interface TripDaysState {
  dates: string[]
  // Aligned with dates; null until that day has loaded.
  days: (Day | null)[] | null
  error: boolean
  // replaceDay updates one loaded day in place (after a local edit).
  replaceDay: (day: Day) => void
}

// useTripDays loads every day of a trip, painting from the on-device cache
// first (shared per-day keys with the day screen, so a browsed trip is warm),
// then revalidating. A failed refresh with a full cache is non-destructive.
// `refreshKey` re-reads the cache (e.g. when the open day changes) without
// refetching.
export function useTripDays(trip: Trip, refreshKey?: string, enabled = true): TripDaysState {
  const dates = datesInRange(trip.start_date, trip.end_date)
  const [days, setDays] = useState<(Day | null)[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    let done = false
    const ds = datesInRange(trip.start_date, trip.end_date)
    void Promise.all(ds.map((d) => readCache<Day>(cacheKeys.day(trip.id, d)))).then((cached) => {
      if (done) return
      const fromCache = cached.map((c) => c?.data ?? null)
      const full = fromCache.every(Boolean)
      if (fromCache.some(Boolean)) setDays(fromCache)
      return Promise.all(ds.map((d) => fetchDay(trip.id, d, controller.signal)))
        .then((loaded) => {
          if (done) return
          setDays(loaded)
          loaded.forEach((day) => void writeCache(cacheKeys.day(trip.id, day.date), day))
        })
        .catch((err: unknown) => {
          if (done) return
          if (err instanceof DOMException && err.name === 'AbortError') return
          if (err instanceof UnauthorizedError) return
          if (!full) setError(true)
        })
    })
    return () => {
      done = true
      controller.abort()
    }
  }, [trip.id, trip.start_date, trip.end_date, enabled])

  // Cheap re-sync from cache when the caller signals (e.g. the open day changed
  // after edits there): the day screen writes every mutation to the cache.
  useEffect(() => {
    if (refreshKey === undefined || !enabled) return
    let done = false
    const ds = datesInRange(trip.start_date, trip.end_date)
    void Promise.all(ds.map((d) => readCache<Day>(cacheKeys.day(trip.id, d)))).then((cached) => {
      if (done) return
      setDays((cur) => {
        if (!cur) return cur
        return cur.map((d, i) => cached[i]?.data ?? d)
      })
    })
    return () => {
      done = true
    }
  }, [refreshKey, trip.id, trip.start_date, trip.end_date, enabled])

  const replaceDay = (day: Day) =>
    setDays((cur) => (cur ? cur.map((d) => (d && d.date === day.date ? day : d)) : cur))

  return { dates, days, error, replaceDay }
}

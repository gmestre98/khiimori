import { useEffect, useState } from 'react'
import {
  JournalEntryNotFoundError,
  UnauthorizedError,
  datesInRange,
  fetchDay,
  fetchJournalEntry,
  listPhotos,
  type Day,
  type Photo,
  type Trip,
} from '../lib/api'

// DaySummary is everything the travelogue needs for one day: the resolved day
// (for "what happened") plus the entry body and its photos.
export interface DaySummary {
  date: string
  index: number
  dayId: string
  day: Day
  hasEntry: boolean
  body: string
  photos: Photo[]
}

// loadDaySummary resolves one day and, if it has a journal entry, its fields and
// photos. A missing entry (404) is normal — it yields an empty summary. Photo
// listing failures fold into an empty photo list rather than failing the day.
async function loadDaySummary(
  tripId: string,
  date: string,
  index: number,
  signal: AbortSignal,
): Promise<DaySummary> {
  const day = await fetchDay(tripId, date, signal)
  const base: DaySummary = {
    date,
    index,
    dayId: day.id,
    day,
    hasEntry: false,
    body: '',
    photos: [],
  }
  try {
    const entry = await fetchJournalEntry(tripId, day.id, signal)
    let photos: Photo[] = []
    try {
      photos = await listPhotos(tripId, day.id, signal)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      if (err instanceof UnauthorizedError) throw err
    }
    return { ...base, hasEntry: true, body: entry.body, photos }
  } catch (err) {
    if (err instanceof JournalEntryNotFoundError) return base
    throw err
  }
}

// hasContent is true when a day has anything worth showing in the travelogue —
// text or photos.
export function hasContent(s: DaySummary): boolean {
  return s.body.trim() !== '' || s.photos.length > 0
}

// useTravelogue loads every day's journal summary once.
export function useTravelogue(trip: Trip) {
  const [summaries, setSummaries] = useState<DaySummary[] | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    const dates = datesInRange(trip.start_date, trip.end_date)
    Promise.all(dates.map((d, i) => loadDaySummary(trip.id, d, i, controller.signal)))
      .then((loaded) => {
        if (controller.signal.aborted) return
        setSummaries(loaded)
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (err instanceof UnauthorizedError) return
        setError(true)
      })
    return () => controller.abort()
  }, [trip.id, trip.start_date, trip.end_date])
  return { summaries, error }
}

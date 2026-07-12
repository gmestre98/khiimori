import { useEffect, useState } from 'react'
import {
  JournalEntryNotFoundError,
  UnauthorizedError,
  datesInRange,
  fetchDay,
  fetchJournalEntry,
  listPhotos,
  type Photo,
} from '../lib/api'
import { fullDate } from '../lib/format'
import { MOOD_LABELS, WEATHER_LABELS } from '../journal/journalMeta'
import { PhotoLightbox } from '../journal/PhotoGrid'
import { useTripShell } from './useTripShell'

// DaySummary is everything the travelogue needs for one day: the resolved day id
// plus the entry fields (rating, weather, mood, body) and its photos.
interface DaySummary {
  date: string
  index: number
  dayId: string
  hasEntry: boolean
  rating: number | null
  weather: string
  mood: string
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
    hasEntry: false,
    rating: null,
    weather: '',
    mood: '',
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
      // Non-fatal: show the entry without its photos.
    }
    return {
      ...base,
      hasEntry: true,
      rating: entry.rating,
      weather: entry.weather,
      mood: entry.mood,
      body: entry.body,
      photos,
    }
  } catch (err) {
    if (err instanceof JournalEntryNotFoundError) return base
    throw err
  }
}

// hasContent is true when a day has anything worth showing in the travelogue —
// text, a rating, weather, mood, or photos.
function hasContent(s: DaySummary): boolean {
  return (
    s.body.trim() !== '' ||
    s.rating !== null ||
    s.weather !== '' ||
    s.mood !== '' ||
    s.photos.length > 0
  )
}

// Stars renders a read-only 1–5 rating as filled/empty stars, or nothing when
// unrated.
function Stars({ rating }: { rating: number | null }) {
  if (rating === null) return null
  return (
    <span className="trip-journal-stars" aria-label={`Rated ${rating} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={`trip-journal-star${n <= rating ? ' trip-journal-star--on' : ''}`}
          aria-hidden="true"
        >
          ★
        </span>
      ))}
    </span>
  )
}

// TravelogueDay renders one day's entry in the read-only feed: its meta chips,
// body text, and a thumbnail strip that opens the shared lightbox.
function TravelogueDay({
  summary,
  onOpenPhoto,
}: {
  summary: DaySummary
  onOpenPhoto: (p: Photo) => void
}) {
  return (
    <article className="trip-journal-entry" aria-label={`Day ${summary.index + 1}`}>
      <header className="trip-journal-entry-head">
        <h2 className="trip-journal-entry-title">
          Day {summary.index + 1} · {fullDate(summary.date)}
        </h2>
        <Stars rating={summary.rating} />
      </header>

      {(summary.weather || summary.mood) && (
        <p className="trip-journal-entry-meta">
          {summary.weather && (
            <span className="trip-journal-chip">
              {WEATHER_LABELS[summary.weather] ?? summary.weather}
            </span>
          )}
          {summary.mood && (
            <span className="trip-journal-chip">{MOOD_LABELS[summary.mood] ?? summary.mood}</span>
          )}
        </p>
      )}

      {summary.body.trim() !== '' && <p className="trip-journal-entry-body">{summary.body}</p>}

      {summary.photos.length > 0 && (
        <div className="trip-journal-thumbs">
          {summary.photos.map((p) => (
            <button
              key={p.id}
              type="button"
              className="trip-journal-thumb"
              onClick={() => onOpenPhoto(p)}
              aria-label={p.caption ? `Photo: ${p.caption}` : 'Open photo'}
            >
              <img
                src={p.thumbnail_url || p.storage_url}
                alt={p.caption || 'Photo'}
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
    </article>
  )
}

// TripTravelogue is the read-only "read your trip as a diary" feed: it stitches
// every day's journal entry and photos into one scrollable travelogue. It lives
// in the Day tab's whole-trip view, below the plan stack, so the merged tab
// still offers the diary read the standalone Journal tab used to. It loads each
// day's entry once on mount.
export function TripTravelogue() {
  const { trip } = useTripShell()
  const dates = datesInRange(trip.start_date, trip.end_date)

  const [summaries, setSummaries] = useState<DaySummary[] | null>(null)
  const [error, setError] = useState(false)
  const [lightboxPhoto, setLightboxPhoto] = useState<Photo | null>(null)

  useEffect(() => {
    const controller = new AbortController()
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
    // trip.id is stable (TripShell remounts per trip); dates derive from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id])

  if (error) {
    return (
      <p role="alert" className="trip-journal-error">
        Could not load the travelogue.
      </p>
    )
  }
  if (summaries === null) {
    return (
      <p className="trip-journal-loading" aria-busy="true">
        Loading travelogue…
      </p>
    )
  }

  const travelogueDays = summaries.filter(hasContent)

  return (
    <section className="trip-travelogue" aria-label="Travelogue">
      <h2 className="day-slot-title">Travelogue</h2>
      {travelogueDays.length > 0 ? (
        <div className="trip-journal-feed">
          {travelogueDays.map((s) => (
            <TravelogueDay key={s.date} summary={s} onOpenPhoto={setLightboxPhoto} />
          ))}
        </div>
      ) : (
        <p className="trip-journal-caption">
          No journal entries yet. Pick a day above to write about it and add photos.
        </p>
      )}
      {lightboxPhoto && (
        <PhotoLightbox photo={lightboxPhoto} onClose={() => setLightboxPhoto(null)} />
      )}
    </section>
  )
}

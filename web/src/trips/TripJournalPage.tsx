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
import { fullDate, shortDate } from '../lib/format'
import { JournalEditor } from '../journal/JournalEditor'
import { MOOD_LABELS, WEATHER_LABELS } from '../journal/journalMeta'
import { PhotoLightbox } from '../journal/PhotoGrid'
import { useTripShell } from './useTripShell'

// DaySummary is everything the subtab needs for one day: the resolved day id
// (needed to load its journal + photos), whether an entry exists, and the entry
// fields the rail status and travelogue render.
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
// text, a rating, weather, mood, or photos. An entry row with all fields blank
// is treated as empty so it doesn't clutter the feed.
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

// dayCaption is the muted status line under each rail row.
function dayCaption(s: DaySummary): string {
  if (!s.hasEntry || !hasContent(s)) return 'No entry yet'
  const parts: string[] = []
  if (s.weather) parts.push(WEATHER_LABELS[s.weather] ?? s.weather)
  if (s.photos.length > 0) {
    parts.push(`${s.photos.length} ${s.photos.length === 1 ? 'photo' : 'photos'}`)
  }
  if (parts.length === 0) parts.push('Written')
  return parts.join(' · ')
}

// TravelogueDay renders one day's entry in the read-only whole-trip feed: its
// meta chips, body text, and a thumbnail strip that opens the shared lightbox.
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
            <span className="trip-journal-chip">{WEATHER_LABELS[summary.weather]}</span>
          )}
          {summary.mood && <span className="trip-journal-chip">{MOOD_LABELS[summary.mood]}</span>}
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

// TripJournalPage is the trip-scoped Journal subtab (/trips/:tripId/journal). A
// left rail lists every day with its journal status plus a "Whole trip" row.
// Selecting a day opens that day's full editor (reusing JournalEditor);
// selecting "Whole trip" (the default) shows a read-only travelogue stitching
// every day's entry and photos into one scrollable diary.
export function TripJournalPage() {
  const { trip } = useTripShell()
  const dates = datesInRange(trip.start_date, trip.end_date)
  // A past trip's journal is read-only (matches the day view's behaviour).
  const isPast = trip.end_date < new Date().toISOString().slice(0, 10)

  const [summaries, setSummaries] = useState<DaySummary[] | null>(null)
  const [error, setError] = useState(false)
  // selectedDate is the day being edited on the right; null means the whole-trip
  // travelogue (the landing view).
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
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

  // reloadDay refreshes one day's summary after the editor persists a change, so
  // the rail status and travelogue stay in sync without a full reload.
  const reloadDay = (date: string, index: number) => {
    const controller = new AbortController()
    loadDaySummary(trip.id, date, index, controller.signal)
      .then((fresh) => {
        setSummaries((cur) => (cur ? cur.map((s) => (s.date === date ? fresh : s)) : cur))
      })
      .catch(() => {
        // Best-effort refresh; leave the stale summary in place on failure.
      })
  }

  const selected = summaries?.find((s) => s.date === selectedDate) ?? null
  const travelogueDays = (summaries ?? []).filter(hasContent)

  return (
    <article className="trip-journal-page" aria-label={`Journal for ${trip.name}`}>
      <div className="screen-content trip-journal-body">
        <header className="trip-journal-head">
          <h1 className="h1">Trip journal</h1>
          <p className="meta">
            Read your trip as a diary, or pick a day to write about it and add photos.
          </p>
        </header>

        {error ? (
          <p role="alert" className="trip-journal-error">
            Could not load the trip journal.
          </p>
        ) : summaries === null ? (
          <p className="trip-journal-loading" aria-busy="true">
            Loading trip journal…
          </p>
        ) : (
          <div className="trip-journal-layout">
            <nav className="trip-journal-days" aria-label="Days">
              <button
                type="button"
                className={[
                  'trip-journal-day',
                  selectedDate === null ? 'trip-journal-day--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-pressed={selectedDate === null}
                onClick={() => setSelectedDate(null)}
              >
                <span
                  className="trip-journal-day-dot trip-journal-day-dot--all"
                  aria-hidden="true"
                />
                <span className="trip-journal-day-label">Whole trip</span>
                <span className="trip-journal-day-meta">Read as a travelogue</span>
              </button>
              {summaries.map((s) => (
                <button
                  key={s.date}
                  type="button"
                  className={[
                    'trip-journal-day',
                    selectedDate === s.date ? 'trip-journal-day--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-pressed={selectedDate === s.date}
                  onClick={() => setSelectedDate(s.date)}
                >
                  <span
                    className={[
                      'trip-journal-day-dot',
                      hasContent(s) ? 'trip-journal-day-dot--filled' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-hidden="true"
                  />
                  <span className="trip-journal-day-label">
                    Day {s.index + 1} · {shortDate(s.date)}
                  </span>
                  <span className="trip-journal-day-meta">{dayCaption(s)}</span>
                </button>
              ))}
            </nav>

            <div className="trip-journal-panel">
              {selected ? (
                <JournalEditor
                  key={selected.dayId}
                  tripId={trip.id}
                  dayId={selected.dayId}
                  readOnly={isPast}
                  onEntryChange={() => reloadDay(selected.date, selected.index)}
                />
              ) : travelogueDays.length > 0 ? (
                <div className="trip-journal-feed">
                  {travelogueDays.map((s) => (
                    <TravelogueDay key={s.date} summary={s} onOpenPhoto={setLightboxPhoto} />
                  ))}
                </div>
              ) : (
                <p className="trip-journal-caption">
                  No journal entries yet. Pick a day to write about it and add photos.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {lightboxPhoto && (
        <PhotoLightbox photo={lightboxPhoto} onClose={() => setLightboxPhoto(null)} />
      )}
    </article>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  JournalEntryNotFoundError,
  UnauthorizedError,
  fetchJournalEntry,
  upsertJournalEntry,
  type JournalEntry,
  type JournalEntryInput,
} from '../lib/api'
import { PhotoGrid } from './PhotoGrid'

const DEBOUNCE_MS = 800

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const WEATHER_OPTIONS = ['', 'sunny', 'cloudy', 'rainy', 'snowy', 'windy', 'stormy', 'foggy']
const MOOD_OPTIONS = ['', 'great', 'good', 'okay', 'tired', 'stressed', 'sad']

const WEATHER_LABELS: Record<string, string> = {
  '': '—',
  sunny: '☀️ Sunny',
  cloudy: '☁️ Cloudy',
  rainy: '🌧️ Rainy',
  snowy: '❄️ Snowy',
  windy: '💨 Windy',
  stormy: '⛈️ Stormy',
  foggy: '🌫️ Foggy',
}

const MOOD_LABELS: Record<string, string> = {
  '': '—',
  great: '😄 Great',
  good: '🙂 Good',
  okay: '😐 Okay',
  tired: '😴 Tired',
  stressed: '😤 Stressed',
  sad: '😢 Sad',
}

interface JournalEditorProps {
  tripId: string
  dayId: string
  readOnly?: boolean
}

export function JournalEditor({ tripId, dayId, readOnly = false }: JournalEditorProps) {
  const [entry, setEntry] = useState<JournalEntry | null>(null)
  const [body, setBody] = useState('')
  const [rating, setRating] = useState<number | null>(null)
  const [weather, setWeather] = useState('')
  const [mood, setMood] = useState('')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  // loadError is scoped to a dayId so stale errors from a previous day are not
  // shown when the user navigates to a new day (avoids synchronous setState reset).
  const [loadError, setLoadError] = useState<{ dayId: string; msg: string } | null>(null)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // loadedDayId tracks which dayId's data is currently in state. The auto-save
  // effect only fires when loadedDayId === dayId, preventing stale-state saves
  // during a day-change (avoids synchronous setState in the fetch effect).
  const [loadedDayId, setLoadedDayId] = useState<string | null>(null)
  const loaded = loadedDayId === dayId

  // Load existing entry on mount / when dayId changes.
  useEffect(() => {
    const controller = new AbortController()

    fetchJournalEntry(tripId, dayId, controller.signal)
      .then((e) => {
        setEntry(e)
        setBody(e.body)
        setRating(e.rating)
        setWeather(e.weather)
        setMood(e.mood)
        setLoadedDayId(dayId)
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (err instanceof UnauthorizedError) return
        if (err instanceof JournalEntryNotFoundError) {
          // No entry yet — start fresh.
          setEntry(null)
          setBody('')
          setRating(null)
          setWeather('')
          setMood('')
          setLoadedDayId(dayId)
          return
        }
        setLoadError({ dayId, msg: 'Could not load journal.' })
      })

    return () => {
      controller.abort()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [tripId, dayId])

  const save = useCallback(
    async (input: JournalEntryInput) => {
      setSaveStatus('saving')
      try {
        const saved = await upsertJournalEntry(tripId, dayId, input)
        setEntry(saved)
        setSaveStatus('saved')
      } catch {
        setSaveStatus('error')
      }
    },
    [tripId, dayId],
  )

  // Auto-save whenever body/rating/weather/mood change. `loaded` (derived from
  // loadedDayId === dayId) ensures this never fires with stale values from the
  // previous day — the auto-save is gated on the current fetch having resolved.
  useEffect(() => {
    if (!loaded) return
    if (readOnly) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      void save({ body, rating, weather, mood })
    }, DEBOUNCE_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [body, rating, weather, mood, save, readOnly, loaded])

  const error = loadError?.dayId === dayId ? loadError.msg : null

  if (error) {
    return <p className="journal-editor-error">{error}</p>
  }

  return (
    <div className="journal-editor">
      <div className="journal-editor-meta">
        <fieldset className="journal-rating" disabled={readOnly}>
          <legend className="journal-meta-label">Rating</legend>
          <div className="journal-rating-stars" role="group" aria-label="Rating 1–5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={`journal-star${rating !== null && n <= rating ? ' journal-star--active' : ''}`}
                aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
                aria-pressed={rating === n}
                onClick={() => {
                  if (!readOnly) setRating(rating === n ? null : n)
                }}
                disabled={readOnly}
              >
                ★
              </button>
            ))}
          </div>
        </fieldset>

        <label className="journal-meta-field">
          <span className="journal-meta-label">Weather</span>
          <select
            className="journal-select"
            value={weather}
            onChange={(e) => setWeather(e.target.value)}
            disabled={readOnly}
            aria-label="Weather"
          >
            {WEATHER_OPTIONS.map((w) => (
              <option key={w} value={w}>
                {WEATHER_LABELS[w]}
              </option>
            ))}
          </select>
        </label>

        <label className="journal-meta-field">
          <span className="journal-meta-label">Mood</span>
          <select
            className="journal-select"
            value={mood}
            onChange={(e) => setMood(e.target.value)}
            disabled={readOnly}
            aria-label="Mood"
          >
            {MOOD_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {MOOD_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <textarea
        className="journal-body"
        placeholder={readOnly ? 'No journal entry for this day.' : 'Write about your day…'}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={readOnly}
        rows={6}
        aria-label="Journal entry"
      />

      {!readOnly && saveStatus !== 'idle' && (
        <p className={`journal-save-status journal-save-status--${saveStatus}`} aria-live="polite">
          {saveStatus === 'saving' && 'Saving…'}
          {saveStatus === 'saved' && 'Saved'}
          {saveStatus === 'error' && (
            <>
              Could not save.{' '}
              <button
                type="button"
                className="journal-save-retry"
                onClick={() => void save({ body, rating, weather, mood })}
              >
                Retry
              </button>
            </>
          )}
        </p>
      )}

      {readOnly && !entry && <p className="journal-empty">No journal entry for this day.</p>}

      <PhotoGrid
        tripId={tripId}
        dayId={dayId}
        readOnly={readOnly}
        onBeforeUpload={
          readOnly
            ? undefined
            : async () => {
                // Ensure an entry row exists before the server accepts a photo.
                if (!entry) {
                  await save({ body, rating, weather, mood })
                }
              }
        }
      />
    </div>
  )
}

import { useEffect, useState } from 'react'
import { readCache, writeCache } from '../lib/resourceCache'
import { cacheKeys } from '../lib/cacheKeys'
import {
  JournalEntryNotFoundError,
  UnauthorizedError,
  fetchJournalEntry,
  listPhotos,
  type JournalEntry,
  type Photo,
} from '../lib/api'
import { JournalEditor } from './JournalEditor'

// summarize turns a cached entry (and its cached photos) into the one-line
// preview shown on the collapsed row. Empty string means "nothing written yet",
// which the caller renders as the invite copy instead.
function summarize(entry: JournalEntry | null, photos: Photo[]): string {
  const body = entry?.body.trim() ?? ''
  const n = photos.length
  const shots = n > 0 ? `${n} ${n === 1 ? 'photo' : 'photos'}` : ''
  if (body === '') return shots
  // First non-blank line — an entry that opens with a blank line still previews.
  const line =
    body
      .split('\n')
      .find((l) => l.trim() !== '')
      ?.trim() ?? ''
  const clipped = line.length > 90 ? `${line.slice(0, 90)}…` : line
  return shots === '' ? clipped : `${clipped} · ${shots}`
}

// DayDiary is the collapsed-by-default diary affordance for a day in the
// whole-trip stack: a single row you click to reveal the full JournalEditor
// (text, rating/weather/mood, photos). It keeps an expanded day short while
// still putting "write a note and add pictures" one click away on every day.
//
// The preview paints from the on-device cache first and then revalidates, so a
// day written on another device still shows its note here without opening the
// editor. The editor itself (and its photo grid) mounts only once opened.
export function DayDiary({
  tripId,
  dayId,
  readOnly = false,
}: {
  tripId: string
  dayId: string
  readOnly?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    let done = false

    void Promise.all([
      readCache<JournalEntry>(cacheKeys.journal(tripId, dayId)),
      readCache<Photo[]>(cacheKeys.photos(tripId, dayId)),
    ]).then(([entry, photos]) => {
      if (done) return
      setPreview(summarize(entry?.data ?? null, photos?.data ?? []))

      // While the editor is open it owns the fetch — don't duplicate it.
      if (open) return

      // Revalidate. A 404 is the normal "nothing written yet" case; any other
      // failure (offline included) just leaves the cached preview standing.
      return Promise.all([
        fetchJournalEntry(tripId, dayId, controller.signal)
          .then((e) => {
            void writeCache(cacheKeys.journal(tripId, dayId), e)
            return e
          })
          .catch((err: unknown) => {
            if (err instanceof JournalEntryNotFoundError) return null
            throw err
          }),
        listPhotos(tripId, dayId, controller.signal).then((ps) => {
          void writeCache(cacheKeys.photos(tripId, dayId), ps)
          return ps
        }),
      ])
        .then(([e, ps]) => {
          if (done) return
          setPreview(summarize(e, ps))
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return
          if (err instanceof UnauthorizedError) return
          // Non-fatal: keep whatever the cache gave us.
        })
    })

    return () => {
      done = true
      controller.abort()
    }
    // Re-runs on collapse so an edit made while open lands in the preview.
  }, [tripId, dayId, open])

  return (
    <section className="day-diary" aria-label="Diary">
      <button
        type="button"
        className="day-diary-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="day-diary-icon" aria-hidden="true">
          📔
        </span>
        <span className="day-diary-summary">
          {preview !== '' ? preview : readOnly ? 'No diary entry' : 'Add a diary note or photos'}
        </span>
        <span className="day-diary-chevron" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && <JournalEditor tripId={tripId} dayId={dayId} readOnly={readOnly} />}
    </section>
  )
}

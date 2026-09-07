import { useCallback, useEffect, useRef, useState } from 'react'
import {
  JournalEntryNotFoundError,
  UnauthorizedError,
  fetchJournalEntry,
  upsertJournalEntry,
  type JournalEntry,
  type JournalEntryInput,
} from '../lib/api'
import { enqueue } from '../lib/mutationQueue'
import { useIsOnline } from '../lib/useIsOnline'
import { readCache, writeCache, deleteCache } from '../lib/resourceCache'
import { cacheKeys } from '../lib/cacheKeys'
import { PhotoGrid } from './PhotoGrid'
import { UsageBar } from './UsageBar'

const DEBOUNCE_MS = 800

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface JournalEditorProps {
  tripId: string
  dayId: string
  readOnly?: boolean
  // onEntryChange fires after a change is persisted to the server (a successful
  // save, or a photo add/remove) so a host like the trip Journal subtab can
  // refresh its day-rail status and travelogue. It is not called for offline
  // queued saves, since the server copy hasn't changed yet.
  onEntryChange?: () => void
}

export function JournalEditor({
  tripId,
  dayId,
  readOnly = false,
  onEntryChange,
}: JournalEditorProps) {
  const online = useIsOnline()
  const [entry, setEntry] = useState<JournalEntry | null>(null)
  const [body, setBody] = useState('')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  // savedAsQueued records whether the most recent save was written to the
  // offline queue rather than the server. Derived from the save path, not
  // from live `online`, so the label stays correct if connectivity changes
  // between the save and the next render.
  const [savedAsQueued, setSavedAsQueued] = useState(false)
  // loadError is scoped to a dayId so stale errors from a previous day are not
  // shown when the user navigates to a new day (avoids synchronous setState reset).
  const [loadError, setLoadError] = useState<{ dayId: string; msg: string } | null>(null)
  // usageRefreshKey is incremented whenever a photo is uploaded or deleted so
  // UsageBar re-fetches the server's authoritative usage figure.
  const [usageRefreshKey, setUsageRefreshKey] = useState(0)

  // onEntryChange is held in a ref so it can be called from `save` without being
  // a dependency of it. The subtab passes a fresh closure each render; if that
  // identity fed `save` (and thus the auto-save effect), each save would re-arm
  // the debounce and trigger another save — an infinite loop.
  const onEntryChangeRef = useRef(onEntryChange)
  useEffect(() => {
    onEntryChangeRef.current = onEntryChange
  }, [onEntryChange])

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // loadedDayId tracks which dayId's data is currently in state. The auto-save
  // effect only fires when loadedDayId === dayId, preventing stale-state saves
  // during a day-change (avoids synchronous setState in the fetch effect).
  const [loadedDayId, setLoadedDayId] = useState<string | null>(null)
  const loaded = loadedDayId === dayId

  // The field values last written by a *load* (cache seed or fetch), so the
  // auto-save effect can tell a programmatic hydrate from a real user edit and
  // skip saving the former (see the auto-save effect below).
  type Fields = { body: string }
  const lastLoadedRef = useRef<Fields | null>(null)
  // The current field values, mirrored into a ref so the load effect can check
  // whether the user has edited since the last load without clobbering their
  // in-progress writing when a background refresh lands.
  const fieldsRef = useRef<Fields>({ body })
  useEffect(() => {
    fieldsRef.current = { body }
  })

  // Load the entry on mount / dayId change with the instant-render cache
  // (M11.1): paint the last-known entry from IndexedDB immediately, then
  // revalidate. Applying loaded values also records them in lastLoadedRef so the
  // hydrate never triggers an auto-save.
  useEffect(() => {
    const controller = new AbortController()
    let done = false
    const key = cacheKeys.journal(tripId, dayId)

    // apply writes a loaded entry (or null = "no entry yet") into the form and
    // marks it as the load baseline. Guarded by `done` at every call site.
    const apply = (e: JournalEntry | null) => {
      setEntry(e)
      setBody(e?.body ?? '')
      lastLoadedRef.current = { body: e?.body ?? '' }
      setLoadedDayId(dayId)
    }

    // hasEdited reports whether the user has diverged from the last load, so a
    // late fetch doesn't overwrite in-progress edits.
    const hasEdited = () => {
      const ll = lastLoadedRef.current
      const cur = fieldsRef.current
      return ll !== null && cur.body !== ll.body
    }

    void readCache<JournalEntry>(key).then((cached) => {
      if (done) return
      if (cached) apply(cached.data) // instant paint from the on-device cache
      return fetchJournalEntry(tripId, dayId, controller.signal).then(
        (e) => {
          if (done) return
          void writeCache(key, e)
          if (!hasEdited()) apply(e) // don't clobber the user's in-progress edits
        },
        (err: unknown) => {
          if (done) return
          if (err instanceof DOMException && err.name === 'AbortError') return
          if (err instanceof UnauthorizedError) return
          if (err instanceof JournalEntryNotFoundError) {
            // No entry on the server — drop any stale cached copy and, unless the
            // user is already writing, show the fresh/empty form.
            void deleteCache(key)
            if (!hasEdited()) apply(null)
            return
          }
          // Other failure is non-destructive: keep the cached entry on screen;
          // only surface an error when there was nothing cached to show.
          if (!cached) setLoadError({ dayId, msg: 'Could not load journal.' })
        },
      )
    })

    return () => {
      done = true
      controller.abort()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [tripId, dayId])

  const save = useCallback(
    async (input: JournalEntryInput) => {
      setSaveStatus('saving')
      try {
        if (!online) {
          // Offline: queue as an idempotent write; replay on reconnect.
          await enqueue('upsertJournalEntry', { tripId, dayId, input })
          setSavedAsQueued(true)
          setSaveStatus('saved')
          return
        }
        setSavedAsQueued(false)
        const saved = await upsertJournalEntry(tripId, dayId, input)
        setEntry(saved)
        // Keep the on-device cache current so the next open renders the latest
        // saved entry instantly (and offline).
        void writeCache(cacheKeys.journal(tripId, dayId), saved)
        setSaveStatus('saved')
        onEntryChangeRef.current?.()
      } catch {
        setSaveStatus('error')
      }
    },
    [tripId, dayId, online],
  )

  // Auto-save whenever the body changes. `loaded` (derived from
  // loadedDayId === dayId) ensures this never fires with a stale value from the
  // previous day — the auto-save is gated on the current fetch having resolved.
  useEffect(() => {
    if (!loaded) return
    if (readOnly) return
    // Skip when the current value is exactly what a load (cache seed or fetch)
    // just wrote — hydrating the form is not a user edit and must not trigger a
    // save (which, offline, would needlessly queue a write).
    const ll = lastLoadedRef.current
    if (ll && ll.body === body) {
      return
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      void save({ body })
    }, DEBOUNCE_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [body, save, readOnly, loaded])

  const error = loadError?.dayId === dayId ? loadError.msg : null

  if (error) {
    return <p className="journal-editor-error">{error}</p>
  }

  return (
    <div className="journal-editor">
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
          {saveStatus === 'saved' && (savedAsQueued ? 'Queued — will sync when online' : 'Saved')}
          {saveStatus === 'error' && (
            <>
              Could not save.{' '}
              <button
                type="button"
                className="journal-save-retry"
                onClick={() => void save({ body })}
              >
                Retry
              </button>
            </>
          )}
        </p>
      )}

      {readOnly && !entry && <p className="journal-empty">No journal entry for this day.</p>}

      <UsageBar tripId={tripId} refreshKey={usageRefreshKey} />

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
                  await save({ body })
                }
              }
        }
        onPhotoChange={() => {
          setUsageRefreshKey((k) => k + 1)
          onEntryChangeRef.current?.()
        }}
      />
    </div>
  )
}

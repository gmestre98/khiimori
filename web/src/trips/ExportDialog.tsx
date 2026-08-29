import { useEffect, useState } from 'react'
import {
  DriveActionRequiredError,
  NoTripsError,
  UnauthorizedError,
  driveConnectUrl,
  exportAllTripsToGoogleDoc,
  exportTripToGoogleDoc,
  fetchDriveConnection,
  type ExportResult,
} from '../lib/api'
import { Button, Sheet } from '../components/ui'

type Phase =
  | { kind: 'checking' }
  // reconnect=true means the grant was revoked (was connected); false = never connected.
  | { kind: 'not_connected'; reconnect: boolean }
  | { kind: 'ready' }
  | { kind: 'exporting' }
  | { kind: 'done'; result: ExportResult }
  | { kind: 'error'; message: string }

export interface ExportDialogProps {
  open: boolean
  onClose: () => void
  // Single-trip export (the default). Required unless allTrips is set.
  tripId?: string
  tripName?: string
  // All-trips export: combine every trip into one Google Doc with a per-trip
  // outline. tripCount is shown in the copy ("Combine your 5 trips…").
  allTrips?: boolean
  tripCount?: number
}

// ExportDialog exports to a Google Doc in the user's Drive (M13.4): a single trip
// by default, or every trip combined into one outlined document when allTrips is
// set (M13.5). It gates on the Drive connection, offers include-photos /
// include-budget toggles, runs the export, and shows the resulting Doc + folder
// links. Re-exporting updates the same Doc, so the button reads "Update" once a
// doc exists.
export function ExportDialog({
  tripId,
  tripName,
  open,
  onClose,
  allTrips = false,
  tripCount,
}: ExportDialogProps) {
  // Starts in "checking"; the connection probe below updates it. The dialog is
  // mounted fresh each open (gated by the parent), so this initializer resets
  // state without a synchronous setState inside the effect.
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' })
  const [includePhotos, setIncludePhotos] = useState(true)
  const [includeBudget, setIncludeBudget] = useState(true)
  // Whether a doc already exists for this trip → the action reads "Update".
  const [alreadyExported, setAlreadyExported] = useState(false)

  // Probe the Drive connection once so we can show connect vs. export.
  useEffect(() => {
    let cancelled = false
    fetchDriveConnection()
      .then((c) => {
        if (cancelled) return
        setPhase(c.connected ? { kind: 'ready' } : { kind: 'not_connected', reconnect: false })
      })
      .catch((err) => {
        if (cancelled || err instanceof UnauthorizedError) return
        // Can't tell — let the export attempt surface a precise error.
        setPhase({ kind: 'ready' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  function connect() {
    window.location.assign(driveConnectUrl)
  }

  async function runExport() {
    setPhase({ kind: 'exporting' })
    try {
      const opts = { includePhotos, includeBudget }
      const result = allTrips
        ? await exportAllTripsToGoogleDoc(opts)
        : await exportTripToGoogleDoc(tripId ?? '', opts)
      setAlreadyExported(true)
      setPhase({ kind: 'done', result })
    } catch (err) {
      if (err instanceof UnauthorizedError) return // handled centrally
      if (err instanceof DriveActionRequiredError) {
        setPhase({ kind: 'not_connected', reconnect: err.code === 'drive_reconnect_required' })
        return
      }
      if (err instanceof NoTripsError) {
        setPhase({ kind: 'error', message: 'You have no trips to export yet.' })
        return
      }
      setPhase({ kind: 'error', message: 'Couldn’t export to Google Drive. Please try again.' })
    }
  }

  const sheetTitle = allTrips
    ? 'Export all trips to Google Docs'
    : `Export ${tripName} to Google Docs`

  return (
    <Sheet open={open} onClose={onClose} title={sheetTitle}>
      <div className="export-dialog">
        <h2 className="export-dialog-title">
          {allTrips ? 'Export all trips to Google Docs' : 'Export to Google Docs'}
        </h2>
        <p className="export-dialog-sub">
          {allTrips ? (
            <>
              Combines {tripCount ? `your ${tripCount} trips` : 'all your trips'} into one Google
              Doc in a “Khiimori travelogues” folder — a section per trip, with an outline to jump
              between them. Re-exporting updates the same document.
            </>
          ) : (
            <>
              Saves “{tripName}” as a Google Doc in your Drive, in a “Khiimori travelogues” folder.
              Re-exporting updates the same document.
            </>
          )}
        </p>

        {phase.kind === 'checking' && (
          <p className="export-dialog-status" aria-live="polite">
            Checking your Google Drive connection…
          </p>
        )}

        {phase.kind === 'not_connected' && (
          <div className="export-dialog-connect">
            <p>
              {phase.reconnect
                ? 'Your Google Drive connection expired. Reconnect to export — you’ll be taken to your profile.'
                : 'Connect Google Drive to export. You’ll be taken to your profile to connect.'}
            </p>
            <Button variant="secondary" onClick={connect}>
              {phase.reconnect ? 'Reconnect Google Drive' : 'Connect Google Drive'}
            </Button>
          </div>
        )}

        {(phase.kind === 'ready' || phase.kind === 'exporting' || phase.kind === 'error') && (
          <>
            <fieldset className="export-dialog-options" disabled={phase.kind === 'exporting'}>
              <label className="export-dialog-option">
                <input
                  type="checkbox"
                  checked={includePhotos}
                  onChange={(e) => setIncludePhotos(e.target.checked)}
                />
                Include photos
              </label>
              <label className="export-dialog-option">
                <input
                  type="checkbox"
                  checked={includeBudget}
                  onChange={(e) => setIncludeBudget(e.target.checked)}
                />
                Include budget
              </label>
            </fieldset>

            {phase.kind === 'error' && (
              <p role="alert" className="auth-error">
                {phase.message}
              </p>
            )}

            <div className="export-dialog-actions">
              <Button
                variant="primary"
                onClick={() => void runExport()}
                disabled={phase.kind === 'exporting'}
              >
                {phase.kind === 'exporting'
                  ? 'Exporting…'
                  : alreadyExported
                    ? 'Update Google Doc'
                    : 'Export'}
              </Button>
            </div>
          </>
        )}

        {phase.kind === 'done' && (
          <div className="export-dialog-done">
            <span className="export-done-badge" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
                <path
                  d="M5 12.5l4.2 4.2L19 7"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <div className="export-done-head">
              <p role="status" className="export-done-title">
                {allTrips ? 'All your travelogues are ready' : 'Your travelogue is ready'}
              </p>
              <p className="export-done-sub">
                {allTrips
                  ? 'Saved to Google Docs — one document, a section per trip. Use the outline (View → Show outline) to jump between them.'
                  : `“${tripName}” was saved to Google Docs. Re-exporting updates this same document.`}
              </p>
            </div>
            <div className="export-dialog-links">
              <a
                className="export-link export-link--primary"
                href={phase.result.doc_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
                  <path
                    d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M14 3v5h5"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M8.5 13h7M8.5 16.5h7M8.5 9.5h2"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                </svg>
                Open in Google Docs
              </a>
              <a
                className="export-link"
                href={phase.result.folder_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
                  <path
                    d="M4 7a2 2 0 012-2h3.2a2 2 0 011.6.8L12 7h6a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V7z"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinejoin="round"
                  />
                </svg>
                Open folder
              </a>
            </div>
            <button
              type="button"
              className="export-done-again"
              onClick={() => setPhase({ kind: 'ready' })}
            >
              Export again
            </button>
          </div>
        )}
      </div>
    </Sheet>
  )
}

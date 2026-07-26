import { useEffect, useState } from 'react'
import {
  DriveActionRequiredError,
  UnauthorizedError,
  driveConnectUrl,
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
  tripId: string
  tripName: string
  open: boolean
  onClose: () => void
}

// ExportDialog exports a trip to a Google Doc in the user's Drive (M13.4). It
// gates on the Drive connection, offers include-photos / include-budget toggles,
// runs the export, and shows the resulting Doc + folder links. Re-exporting
// updates the same Doc, so the button reads "Update" once a doc exists.
export function ExportDialog({ tripId, tripName, open, onClose }: ExportDialogProps) {
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
      const result = await exportTripToGoogleDoc(tripId, { includePhotos, includeBudget })
      setAlreadyExported(true)
      setPhase({ kind: 'done', result })
    } catch (err) {
      if (err instanceof UnauthorizedError) return // handled centrally
      if (err instanceof DriveActionRequiredError) {
        setPhase({ kind: 'not_connected', reconnect: err.code === 'drive_reconnect_required' })
        return
      }
      setPhase({ kind: 'error', message: 'Couldn’t export to Google Drive. Please try again.' })
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={`Export ${tripName} to Google Docs`}>
      <div className="export-dialog">
        <h2 className="export-dialog-title">Export to Google Docs</h2>
        <p className="export-dialog-sub">
          Saves “{tripName}” as a Google Doc in your Drive, in a “Khiimori travelogues” folder.
          Re-exporting updates the same document.
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
            <p role="status" className="profile-saved">
              Your travelogue is ready.
            </p>
            <div className="export-dialog-links">
              <a href={phase.result.doc_url} target="_blank" rel="noopener noreferrer">
                Open in Google Docs
              </a>
              <a href={phase.result.folder_url} target="_blank" rel="noopener noreferrer">
                Open folder
              </a>
            </div>
            <div className="export-dialog-actions">
              <Button variant="secondary" onClick={() => setPhase({ kind: 'ready' })}>
                Export again
              </Button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  )
}

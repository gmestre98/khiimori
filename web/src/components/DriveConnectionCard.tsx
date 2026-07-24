import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  disconnectDrive,
  driveConnectUrl,
  fetchDriveConnection,
  UnauthorizedError,
  type DriveConnectionStatus,
} from '../lib/api'
import { Button } from './ui'

// DRIVE_ERROR_MESSAGES maps the backend's drive_error codes (delivered on the
// /profile?drive_error=<code> redirect after a failed connect) to friendly copy.
const DRIVE_ERROR_MESSAGES: Record<string, string> = {
  drive_consent_denied: 'Google Drive access was declined. You can try again anytime.',
  drive_scope_missing:
    'The Drive permission wasn’t granted. Please allow it so trips can be exported.',
  drive_not_configured: 'Google Drive export isn’t available right now.',
}

function driveErrorMessage(code: string): string {
  return DRIVE_ERROR_MESSAGES[code] ?? 'Couldn’t connect Google Drive. Please try again.'
}

type DriveBanner = { kind: 'ok' | 'error'; text: string }

// bannerFromParams derives the connect-result banner from the ?drive /
// ?drive_error markers the OAuth callback leaves on the URL.
function bannerFromParams(params: URLSearchParams): DriveBanner | null {
  if (params.get('drive') === 'connected') {
    return { kind: 'ok', text: 'Google Drive connected.' }
  }
  const errCode = params.get('drive_error')
  if (errCode) {
    return { kind: 'error', text: driveErrorMessage(errCode) }
  }
  return null
}

// DriveConnectionCard shows the signed-in user's Google Drive export connection
// and lets them connect or disconnect (M13.1 S4). Connecting is a top-level
// navigation to the OAuth flow; on return the backend redirects to
// /profile?drive=connected or /profile?drive_error=<code>, which this card reads
// once and clears.
export function DriveConnectionCard() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [status, setStatus] = useState<DriveConnectionStatus | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  // Derive the connect-result banner once from the URL markers the callback left,
  // so we don't set state inside an effect. The effect below only strips the
  // markers from the URL so a refresh doesn't re-show the banner.
  const [banner, setBanner] = useState<DriveBanner | null>(() => bannerFromParams(searchParams))

  useEffect(() => {
    if (!searchParams.has('drive') && !searchParams.has('drive_error')) return
    const next = new URLSearchParams(searchParams)
    next.delete('drive')
    next.delete('drive_error')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  // Load the current connection status.
  useEffect(() => {
    const ac = new AbortController()
    fetchDriveConnection(ac.signal)
      .then(setStatus)
      .catch((err) => {
        if (err instanceof UnauthorizedError) return // central handler drives re-auth
        if (ac.signal.aborted) return
        setLoadFailed(true)
      })
    return () => ac.abort()
  }, [])

  function onConnect() {
    // Full-page navigation into the OAuth consent flow (like sign-in).
    window.location.assign(driveConnectUrl)
  }

  async function onDisconnect() {
    setDisconnecting(true)
    setActionError(null)
    try {
      await disconnectDrive()
      setStatus({ connected: false })
      setBanner({ kind: 'ok', text: 'Google Drive disconnected.' })
    } catch (err) {
      if (!(err instanceof UnauthorizedError)) {
        setActionError('Couldn’t disconnect Google Drive. Please try again.')
      }
    } finally {
      setDisconnecting(false)
    }
  }

  const connected = status?.connected === true

  return (
    <section className="profile-card drive-card" aria-labelledby="drive-card-title">
      <div className="drive-card-head">
        <h3 id="drive-card-title" className="drive-card-title">
          Google Drive
        </h3>
        <p className="drive-card-sub">
          Export a whole trip as a Google Doc saved to your Drive, in a “Khiimori travelogues”
          folder.
        </p>
      </div>

      {banner && (
        <p
          role={banner.kind === 'error' ? 'alert' : 'status'}
          className={banner.kind === 'error' ? 'auth-error' : 'profile-saved'}
        >
          {banner.text}
        </p>
      )}

      {loadFailed ? (
        <p className="drive-card-status" role="alert">
          Couldn’t check your Google Drive connection. Please try again later.
        </p>
      ) : status === null ? (
        <p className="drive-card-status" aria-live="polite">
          Checking connection…
        </p>
      ) : connected ? (
        <div className="drive-card-row">
          <span className="drive-card-state drive-card-state--on">
            <span className="drive-card-dot" aria-hidden="true" />
            Connected
          </span>
          <Button
            variant="ghost-danger"
            size="sm"
            onClick={() => void onDisconnect()}
            disabled={disconnecting}
          >
            {disconnecting ? 'Disconnecting…' : 'Disconnect'}
          </Button>
        </div>
      ) : (
        <div className="drive-card-row">
          <span className="drive-card-state">Not connected</span>
          <Button variant="secondary" size="sm" onClick={onConnect}>
            Connect Google Drive
          </Button>
        </div>
      )}

      {actionError && (
        <p role="alert" className="auth-error">
          {actionError}
        </p>
      )}
    </section>
  )
}

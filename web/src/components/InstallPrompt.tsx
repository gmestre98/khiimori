import { useState } from 'react'
import './InstallPrompt.css'
import { Button } from './ui'
import { useInstallPrompt } from '../lib/useInstallPrompt'
import { useIsOnline } from '../lib/useIsOnline'

// Persisted across sessions so a visitor who said "Not now" isn't nagged on
// every visit. Cleared automatically once they install (appinstalled hides it).
const DISMISS_KEY = 'khiimori:install-dismissed'

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    // Storage can be unavailable (private mode, blocked cookies); treat as not
    // dismissed so the offer still shows this session.
    return false
  }
}

// IOSShareIcon mirrors the iOS Share glyph so the instruction is recognisable
// at a glance ("tap *this* icon").
function IOSShareIcon() {
  return (
    <svg
      className="install-prompt-share-icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
    </svg>
  )
}

// InstallPrompt is an app-wide, dismissible banner offering home-screen install.
// It renders nothing unless the platform actually supports installing and the
// app isn't already installed — so it stays out of the way for everyone else.
export function InstallPrompt() {
  const { canInstall, showIOSInstructions, install } = useInstallPrompt()
  const online = useIsOnline()
  const [dismissed, setDismissed] = useState(readDismissed)

  if (dismissed) return null
  if (!canInstall && !showIOSInstructions) return null
  // Defer the offer while offline: a fresh install isn't the priority then, and
  // it avoids colliding with the bottom-pinned offline/sync indicators.
  if (!online) return null

  function dismiss() {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // Non-fatal: dismissal just won't persist beyond this session.
    }
  }

  async function onInstall() {
    const outcome = await install()
    // Accepted → appinstalled withdraws the offer; dismissed → respect the
    // choice and don't re-show this session.
    if (outcome !== 'unavailable') dismiss()
  }

  return (
    <div className="install-prompt" role="region" aria-label="Install Khiimori">
      <div className="install-prompt-text">
        <strong>Install Khiimori</strong>
        {showIOSInstructions && !canInstall ? (
          <span>
            Tap <IOSShareIcon /> Share, then “Add to Home Screen”.
          </span>
        ) : (
          <span>Add it to your home screen for a faster, full-screen, offline-ready app.</span>
        )}
      </div>
      <div className="install-prompt-actions">
        {canInstall && (
          <Button size="sm" onClick={onInstall}>
            Install
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={dismiss}>
          {canInstall ? 'Not now' : 'Got it'}
        </Button>
      </div>
    </div>
  )
}

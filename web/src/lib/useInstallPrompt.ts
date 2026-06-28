import { useCallback, useEffect, useState } from 'react'

// useInstallPrompt surfaces the "add to home screen" affordance so a first-time
// visitor can install the PWA without hunting through the browser menu. There
// are two paths because the platforms differ:
//
//   • Chromium (Android / desktop): fires `beforeinstallprompt`, which we
//     capture and replay on demand as a one-tap native install dialog.
//   • iOS Safari: has no such event — the only way in is the manual Share →
//     "Add to Home Screen" flow — so we expose a flag to show instructions.
//
// In both cases we suppress the offer once the app is already installed
// (launched standalone) or has just been installed this session.

// beforeinstallprompt isn't in the standard DOM lib types; declare the slice we
// use. The event is single-use: once prompt() is called it can't be reused.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

// isStandalone reports whether we're already running as an installed app
// (launched from the home screen), in which case there's nothing to offer.
function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari exposes installed state via the non-standard navigator.standalone.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

// isIOSSafari reports iOS Safari specifically. iPadOS 13+ reports a Mac UA, so
// we disambiguate with touch points. In-app browsers and Chrome/Firefox on iOS
// (CriOS/FxiOS/EdgiOS) can't add to the home screen, so they're excluded.
function isIOSSafari(): boolean {
  const ua = navigator.userAgent
  const ios =
    /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (!ios) return false
  return /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua)
}

export interface InstallState {
  /** A native install prompt is available (Chromium); call install() to show it. */
  canInstall: boolean
  /** iOS Safari — no native prompt; show manual Add-to-Home-Screen instructions. */
  showIOSInstructions: boolean
  /** Triggers the native prompt; resolves to the user's choice. */
  install: () => Promise<'accepted' | 'dismissed' | 'unavailable'>
}

export function useInstallPrompt(): InstallState {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  // iOS detection is static (platform/UA based), so it's computed once at mount
  // rather than in the effect; it's withdrawn only if the app gets installed.
  const [showIOS, setShowIOS] = useState(() => !isStandalone() && isIOSSafari())

  useEffect(() => {
    if (isStandalone()) return

    function onBeforeInstall(e: Event) {
      // Stop Chrome's default mini-infobar; we present our own affordance.
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    function onInstalled() {
      // Once installed, withdraw both offers.
      setDeferred(null)
      setShowIOS(false)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = useCallback(async () => {
    if (!deferred) return 'unavailable' as const
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    // The event is single-use; drop it so the button hides afterward.
    setDeferred(null)
    return outcome
  }, [deferred])

  return { canInstall: deferred !== null, showIOSInstructions: showIOS, install }
}

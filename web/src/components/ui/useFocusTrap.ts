import { useEffect, type RefObject } from 'react'

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

// useFocusTrap (M09.3 S3) keeps keyboard focus inside a dialog surface while it
// is open: it moves focus into the container on open, loops Tab / Shift+Tab at
// the edges, and restores focus to the previously-focused element on close.
// Used by both the bottom Sheet (mobile) and the centred modal (laptop) so the
// quick add/edit surface is accessible on either layout.
export function useFocusTrap(active: boolean, containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    if (!container) return

    const previouslyFocused = document.activeElement as HTMLElement | null

    // All tabbable descendants. We deliberately don't filter on layout
    // visibility (offsetParent) — it's unreliable in jsdom and dialog content
    // here is always visible while open.
    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.getAttribute('aria-hidden') !== 'true',
      )

    // Move focus into the surface if it isn't already there.
    if (!container.contains(document.activeElement)) {
      const first = focusables()[0]
      ;(first ?? container).focus()
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const activeEl = document.activeElement
      if (e.shiftKey && activeEl === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault()
        first.focus()
      }
    }

    container.addEventListener('keydown', onKeyDown)
    return () => {
      container.removeEventListener('keydown', onKeyDown)
      // Restore focus to where the user was before the dialog opened.
      previouslyFocused?.focus?.()
    }
  }, [active, containerRef])
}

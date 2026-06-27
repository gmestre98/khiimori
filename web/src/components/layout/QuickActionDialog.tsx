import { useEffect, useRef, type ReactNode } from 'react'
import { Sheet, useFocusTrap } from '../ui'
import { useIsLaptop } from '../../design/useBreakpoint'

export interface QuickActionDialogProps {
  /** Whether the dialog is visible. */
  open: boolean
  /** Called when the user dismisses (overlay/backdrop click or Escape). */
  onClose: () => void
  /** Accessible title for the dialog. */
  title: string
  /** Quick add/edit form content. */
  children: ReactNode
}

// QuickActionDialog (M09.3 S3) is the responsive quick add/edit surface that
// M04's low-friction plan-item/cost flows compose into. Capability parity is
// kept across layouts by switching only the presentation:
//
//   - Mobile: a bottom Sheet (Epic 02 primitive) — thumb-reachable, swipe/tap
//     dismissible, slides up from the thumb zone.
//   - Laptop: a centred modal — the comfortable-layout equivalent.
//
// Both surfaces are accessible: focus is trapped while open, Escape and an
// overlay/backdrop click dismiss, and focus is restored on close.
export function QuickActionDialog({ open, onClose, title, children }: QuickActionDialogProps) {
  const isLaptop = useIsLaptop()

  // Mobile: delegate to the Sheet primitive (already focus-trapped + Escape).
  if (!isLaptop) {
    return (
      <Sheet open={open} onClose={onClose} title={title}>
        {children}
      </Sheet>
    )
  }

  // Laptop: centred modal equivalent.
  return (
    <QuickActionModal open={open} onClose={onClose} title={title}>
      {children}
    </QuickActionModal>
  )
}

function QuickActionModal({ open, onClose, title, children }: QuickActionDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  useFocusTrap(open, dialogRef)

  useEffect(() => {
    if (!open) return
    closeBtnRef.current?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={onClose}
      data-testid="quick-action-backdrop"
    >
      <div
        ref={dialogRef}
        className="modal quick-action-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeBtnRef}
          type="button"
          className="quick-action-modal-close"
          aria-label="Close"
          onClick={onClose}
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  )
}

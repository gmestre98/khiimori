import { useEffect, useRef, type ReactNode } from 'react'
import { useFocusTrap } from './useFocusTrap'

export interface SheetProps {
  /** Whether the sheet is visible. */
  open: boolean
  /** Called when the user dismisses the sheet (overlay click or Escape). */
  onClose: () => void
  /** Accessible title for the sheet (used by aria-labelledby). */
  title: string
  children: ReactNode
}

export function Sheet({ open, onClose, title, children }: SheetProps) {
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Trap focus inside the sheet and restore it on close (M09.3 S3 a11y).
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
      className="sheet-overlay"
      role="presentation"
      onClick={onClose}
      data-testid="sheet-overlay"
    >
      <div
        ref={dialogRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <button ref={closeBtnRef} className="sheet-close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
        {children}
      </div>
    </div>
  )
}

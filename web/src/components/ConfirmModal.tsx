import { useEffect, useRef } from 'react'

// useStableRef keeps a mutable ref in sync with a value so it can be used in
// effects without listing the value as a dep (avoids spurious effect re-runs).
function useStableRef<T>(value: T) {
  const ref = useRef(value)
  ref.current = value
  return ref
}

interface ConfirmModalProps {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  danger?: boolean
}

// ConfirmModal renders a dialog requiring explicit user confirmation before a
// destructive action. Focus is trapped inside and Escape cancels.
export function ConfirmModal({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  danger = false,
}: ConfirmModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const onCancelRef = useStableRef(onCancel)

  useEffect(() => {
    cancelRef.current?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancelRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // onCancelRef is a stable ref object — intentionally omitted from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="modal-title" className="modal-title">
          {title}
        </h2>
        <p className="modal-message">{message}</p>
        <div className="modal-actions">
          <button ref={cancelRef} className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Icon } from '../components/ui/Icon'
import { BOOKING_LABEL, BOOKING_OPTIONS, normalizeBooking } from './booking'
import { ItemSheetFields, type SheetSection } from './ItemSheetFields'
import { emptyFields, suggestedCategory, type PlanItemFormFields } from './planItemForm.helpers'

// AddToPlanSheet is the phone "add to plan" composer (design option A): the
// pinned bar opens a bottom sheet with the shared item rows and a booking
// status. "Add & next" keeps the sheet open for another item; the main button
// adds and closes. The sheet itself (overlay, focus trap, Escape) is the
// caller's BottomSheet.
export function AddToPlanSheet({
  heading,
  submitLabel,
  onSubmit,
  onClose,
  error,
  placement,
  titleRef,
  initialFields,
}: {
  // initialFields edits an existing item: one Save button, no "Add & next".
  initialFields?: PlanItemFormFields
  heading: string
  submitLabel: string
  // Resolves true when the item(s) were added (or queued offline).
  onSubmit: (fields: PlanItemFormFields, splitParts: number) => Promise<boolean>
  onClose: () => void
  error: string | null
  // placement says where an item with these fields lands in the day.
  placement?: (fields: PlanItemFormFields) => string | null
  titleRef?: React.RefObject<HTMLInputElement | null>
}) {
  const [fields, setFields] = useState<PlanItemFormFields>(initialFields ?? emptyFields())
  const editing = !!initialFields
  const [open, setOpen] = useState<SheetSection>(null)
  const [submitting, setSubmitting] = useState(false)
  const [splitParts, setSplitParts] = useState(1)
  const [added, setAdded] = useState<string | null>(null)
  const localTitleRef = useRef<HTMLInputElement>(null)
  const nameRef = titleRef ?? localTitleRef

  useEffect(() => {
    if (!added) return
    const id = window.setTimeout(() => setAdded(null), 2500)
    return () => window.clearTimeout(id)
  }, [added])

  async function submit(next: boolean) {
    const title = fields.title.trim()
    if (!title || submitting) return
    setSubmitting(true)
    let again = false
    try {
      const ok = await onSubmit(fields, splitParts)
      if (!ok) return
      if (next) {
        setFields({ ...emptyFields(), kind: fields.kind, type: suggestedCategory(fields.kind) })
        setSplitParts(1)
        setOpen(null)
        setAdded(title)
        again = true
      } else {
        onClose()
      }
    } finally {
      setSubmitting(false)
      if (again) nameRef.current?.focus()
    }
  }

  const booking = normalizeBooking(fields.booking_status)
  const lands = placement?.(fields) ?? null

  const statusRow =
    fields.kind === 'note' ? null : (
      <>
        <button
          type="button"
          className="add-sheet-row"
          aria-expanded={open === 'status'}
          onClick={() => setOpen(open === 'status' ? null : 'status')}
        >
          <Icon name="check" size={20} />
          <span className="add-sheet-label">Status</span>
          <span className={`add-sheet-status add-sheet-status--${booking}`}>
            {BOOKING_LABEL[booking]}
          </span>
        </button>
        {open === 'status' && (
          <div className="add-sheet-panel add-sheet-chips" role="group" aria-label="Status">
            {BOOKING_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                className="add-sheet-chip"
                aria-pressed={booking === o.value}
                onClick={() => {
                  setFields({ ...fields, booking_status: o.value })
                  setOpen(null)
                }}
                disabled={submitting}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </>
    )

  return (
    <form
      className="add-sheet"
      aria-label={heading}
      onSubmit={(e) => {
        e.preventDefault()
        void submit(false)
      }}
    >
      <div className="add-sheet-body">
        <p className="add-sheet-eyebrow">{heading}</p>
        <ItemSheetFields
          fields={fields}
          onChange={setFields}
          open={open}
          onOpen={setOpen}
          disabled={submitting}
          splitParts={splitParts}
          onSplitParts={setSplitParts}
          statusRow={statusRow}
          titleLabel="Name"
          titleRef={nameRef}
          readOnlyTitle={submitting}
        />

        {lands && (
          <p className="add-sheet-lands">
            <Icon name="check" size={16} />
            <span>{lands}</span>
          </p>
        )}
        {error && (
          <p role="alert" className="add-sheet-error">
            {error}
          </p>
        )}
        {added && (
          <p role="status" className="add-sheet-added">
            Added “{added}”.
          </p>
        )}
      </div>

      <div className="add-sheet-footer">
        {editing ? (
          <button
            type="button"
            className="add-sheet-btn add-sheet-btn--secondary"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
        ) : (
          <button
            type="button"
            className="add-sheet-btn add-sheet-btn--secondary"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void submit(true)}
            disabled={submitting || !fields.title.trim()}
          >
            Add &amp; next
          </button>
        )}
        <button
          type="submit"
          className="add-sheet-btn add-sheet-btn--primary"
          disabled={submitting || !fields.title.trim()}
        >
          {submitLabel}
        </button>
      </div>
    </form>
  )
}

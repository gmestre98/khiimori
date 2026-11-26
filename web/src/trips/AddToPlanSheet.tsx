import { useEffect, useId, useRef, useState } from 'react'
import { Icon } from '../components/ui/Icon'
import { BUDGET_CATEGORIES, type PlanItemKind } from '../lib/api'
import { BOOKING_LABEL, BOOKING_OPTIONS, normalizeBooking } from './booking'
import { LocationField } from './LocationField'
import { MAX_SPLIT_PARTS } from './splitAmount'
import {
  PLAN_ITEM_KINDS,
  emptyFields,
  suggestedCategory,
  type PlanItemFormFields,
} from './planItemForm.helpers'

// AddToPlanSheet is the phone "add to plan" composer (design option A): the
// pinned bar opens a bottom sheet with a big name field, a one-row kind switch,
// and one short row per detail (time, place, duration, cost, category, status,
// note). Time, duration, cost and category edit in place; place, status and
// note open under their row. "Add & next" keeps the sheet open for another item;
// the main button adds and closes. The sheet itself (overlay, focus trap,
// Escape) is the caller's BottomSheet.

type Section = 'where' | 'status' | 'note' | null

export function AddToPlanSheet({
  heading,
  submitLabel,
  onSubmit,
  onClose,
  error,
  placement,
  titleRef,
}: {
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
  const [fields, setFields] = useState<PlanItemFormFields>(emptyFields())
  const [open, setOpen] = useState<Section>(null)
  const [submitting, setSubmitting] = useState(false)
  const [splitParts, setSplitParts] = useState(1)
  const [added, setAdded] = useState<string | null>(null)
  const fid = useId()
  const localTitleRef = useRef<HTMLInputElement>(null)
  const nameRef = titleRef ?? localTitleRef

  useEffect(() => {
    if (!added) return
    const id = window.setTimeout(() => setAdded(null), 2500)
    return () => window.clearTimeout(id)
  }, [added])

  function set<K extends keyof PlanItemFormFields>(key: K, value: PlanItemFormFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  // changeKind keeps a category the user picked; otherwise it follows the kind.
  function changeKind(next: PlanItemKind) {
    setFields((prev) => {
      const keepType = prev.type !== '' && prev.type !== suggestedCategory(prev.kind)
      return { ...prev, kind: next, type: keepType ? prev.type : suggestedCategory(next) }
    })
    setOpen(null)
  }

  function toggle(section: Exclude<Section, null>) {
    setOpen((cur) => (cur === section ? null : section))
  }

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

  const kind = fields.kind
  const cost = parseFloat(fields.cost)
  const booking = normalizeBooking(fields.booking_status)
  const where =
    kind === 'transport'
      ? [fields.origin, fields.destination].filter(Boolean).join(' → ')
      : fields.location
  const noteSummary = [fields.note, fields.link].filter(Boolean).join(' · ')
  const lands = placement?.(fields) ?? null

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
        <input
          ref={nameRef}
          className="add-sheet-title"
          type="text"
          value={fields.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="Name it…"
          aria-label="Name"
          enterKeyHint="done"
          readOnly={submitting}
        />

        <div className="add-sheet-kinds" role="group" aria-label="Kind">
          {PLAN_ITEM_KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              className="add-sheet-kind"
              aria-pressed={kind === k.value}
              onClick={() => changeKind(k.value)}
              disabled={submitting}
            >
              {kind === k.value && <Icon name={k.icon} size={15} />}
              {k.label}
            </button>
          ))}
        </div>

        <div className="add-sheet-rows">
          {kind !== 'note' && (
            <label className="add-sheet-row" htmlFor={`${fid}-time`}>
              <Icon name="clock" size={20} />
              <span className="add-sheet-label">{kind === 'transport' ? 'Departure' : 'Time'}</span>
              <input
                id={`${fid}-time`}
                className="add-sheet-input add-sheet-input--time"
                type="time"
                value={fields.start_time}
                onChange={(e) => set('start_time', e.target.value)}
                disabled={submitting}
              />
            </label>
          )}
          {kind === 'transport' && (
            <label className="add-sheet-row" htmlFor={`${fid}-arrive`}>
              <Icon name="clock" size={20} />
              <span className="add-sheet-label">Arrival</span>
              <input
                id={`${fid}-arrive`}
                className="add-sheet-input add-sheet-input--time"
                type="time"
                value={fields.arrive_time}
                onChange={(e) => set('arrive_time', e.target.value)}
                disabled={submitting}
              />
            </label>
          )}

          {kind !== 'note' && (
            <>
              <button
                type="button"
                className="add-sheet-row"
                aria-expanded={open === 'where'}
                onClick={() => toggle('where')}
              >
                <Icon name="activity" size={20} />
                <span className="add-sheet-label">
                  {kind === 'transport' ? 'From → To' : 'Where'}
                </span>
                <span className={where ? 'add-sheet-value' : 'add-sheet-add'}>
                  {where || 'Add'}
                </span>
              </button>
              {open === 'where' && (
                <div className="add-sheet-panel">
                  {kind === 'transport' ? (
                    <>
                      <LocationField
                        label="From"
                        value={fields.origin}
                        onChange={(v) => set('origin', v)}
                        placeholder="e.g. Toubacouta"
                        disabled={submitting}
                      />
                      <LocationField
                        label="To"
                        value={fields.destination}
                        onChange={(v) => set('destination', v)}
                        placeholder="e.g. Joal-Fadiouth"
                        disabled={submitting}
                      />
                    </>
                  ) : (
                    <LocationField
                      label="Where"
                      value={fields.location}
                      onChange={(v) => set('location', v)}
                      disabled={submitting}
                    />
                  )}
                </div>
              )}
            </>
          )}

          {kind !== 'note' && kind !== 'transport' && (
            <label className="add-sheet-row" htmlFor={`${fid}-dur`}>
              <Icon name="duration" size={20} />
              <span className="add-sheet-label">Duration</span>
              <input
                id={`${fid}-dur`}
                className="add-sheet-input"
                type="text"
                inputMode="numeric"
                value={fields.duration}
                onChange={(e) => set('duration', e.target.value)}
                placeholder="Add"
                disabled={submitting}
              />
            </label>
          )}

          {kind !== 'note' && (
            <>
              <label className="add-sheet-row" htmlFor={`${fid}-cost`}>
                <Icon name="money" size={20} />
                <span className="add-sheet-label">Cost</span>
                <input
                  id={`${fid}-cost`}
                  className="add-sheet-input"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={fields.cost}
                  onChange={(e) => set('cost', e.target.value)}
                  placeholder="Add"
                  disabled={submitting}
                />
              </label>
              {cost > 0 && (
                <div className="add-sheet-split">
                  <label className="add-sheet-split-toggle">
                    <input
                      type="checkbox"
                      checked={splitParts > 1}
                      onChange={(e) => setSplitParts(e.target.checked ? 2 : 1)}
                      disabled={submitting}
                    />
                    Split into several
                  </label>
                  {splitParts > 1 && (
                    <span className="add-sheet-stepper">
                      <button
                        type="button"
                        aria-label="Fewer parts"
                        onClick={() => setSplitParts((n) => Math.max(2, n - 1))}
                        disabled={submitting || splitParts <= 2}
                      >
                        −
                      </button>
                      <span aria-live="polite">
                        {splitParts} · ≈€{(cost / splitParts).toFixed(2)} each
                      </span>
                      <button
                        type="button"
                        aria-label="More parts"
                        onClick={() => setSplitParts((n) => Math.min(MAX_SPLIT_PARTS, n + 1))}
                        disabled={submitting || splitParts >= MAX_SPLIT_PARTS}
                      >
                        +
                      </button>
                    </span>
                  )}
                </div>
              )}

              <label className="add-sheet-row" htmlFor={`${fid}-type`}>
                <Icon name="tag" size={20} />
                <span className="add-sheet-label">Category</span>
                <select
                  id={`${fid}-type`}
                  className="add-sheet-input add-sheet-select"
                  value={fields.type}
                  onChange={(e) => set('type', e.target.value)}
                  disabled={submitting}
                >
                  <option value="">—</option>
                  {BUDGET_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                className="add-sheet-row"
                aria-expanded={open === 'status'}
                onClick={() => toggle('status')}
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
                        set('booking_status', o.value)
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
          )}

          <button
            type="button"
            className="add-sheet-row"
            aria-expanded={open === 'note'}
            onClick={() => toggle('note')}
          >
            <Icon name="note" size={20} />
            <span className="add-sheet-label">Note or link</span>
            <span className={noteSummary ? 'add-sheet-value' : 'add-sheet-add'}>
              {noteSummary || 'Add'}
            </span>
          </button>
          {open === 'note' && (
            <div className="add-sheet-panel">
              <label className="add-sheet-field-label" htmlFor={`${fid}-note`}>
                Note
              </label>
              <textarea
                id={`${fid}-note`}
                className="add-sheet-textarea"
                value={fields.note}
                onChange={(e) => set('note', e.target.value)}
                rows={3}
                placeholder="Tips, what to bring, who to ask…"
                disabled={submitting}
              />
              <label className="add-sheet-field-label" htmlFor={`${fid}-link`}>
                Link
              </label>
              <input
                id={`${fid}-link`}
                className="add-sheet-textfield"
                type="url"
                value={fields.link}
                onChange={(e) => set('link', e.target.value)}
                placeholder="https://…"
                disabled={submitting}
              />
            </div>
          )}
        </div>

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
        <button
          type="button"
          className="add-sheet-btn add-sheet-btn--secondary"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void submit(true)}
          disabled={submitting || !fields.title.trim()}
        >
          Add &amp; next
        </button>
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

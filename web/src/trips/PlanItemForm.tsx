import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '../components/ui/useFocusTrap'
import { Button, FormField, Input, Select } from '../components/ui'
import { LocationField } from './LocationField'
import { MAX_SPLIT_PARTS, splitAmount } from './splitAmount'
import {
  PlanItemValidationError,
  createPlanItem,
  setPlanItemStatus,
  BUDGET_CATEGORIES,
  type PlanItem,
  type PlanItemInput,
  type PlanItemKind,
} from '../lib/api'
import { enqueue } from '../lib/mutationQueue'
import { useIsOnline } from '../lib/useIsOnline'
import {
  AUTO_SAVE_DEBOUNCE_MS,
  DETAILS_OPEN_KEY,
  PLAN_ITEM_KINDS,
  emptyFields,
  fieldsToInput,
  hasDetailValues,
  readDetailsOpen,
  suggestedCategory,
  tempPlanItem,
  useMobile,
  type PlanItemFormFields,
  type SaveStatus,
} from './planItemForm.helpers'

// The shared plan-item add/edit form used by both the day view and the ideas
// backlog, plus the mobile BottomSheet it opens in and the day/backlog add
// wrapper (QuickAddForm). Extracted from DayView so the backlog reuses the exact
// same composer without importing the whole day screen. (M04.5)

// BottomSheet renders children in a bottom-anchored sliding panel on mobile
// (viewport ≤ 640 px). On wider viewports the children render inline with no
// wrapper — callers do not need to know which mode is active.
export function BottomSheet({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean
  onClose: () => void
  label: string
  children: React.ReactNode
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(open, dialogRef)

  // Lock body scroll while the sheet is open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Dismiss on Escape.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="bottom-sheet-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="bottom-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        <div className="bottom-sheet-handle" aria-hidden="true" />
        <button type="button" className="bottom-sheet-close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
        {children}
      </div>
    </div>,
    document.body,
  )
}

// PlanItemForm is the shared add/edit form used in both the day and backlog
// views. It renders a compact title-only quick path; clicking "More options"
// reveals the optional fields.
//
// When onAutoSave is provided (edit mode), field changes are debounced and
// sent automatically; a subtle status badge surfaces saving/saved/error state.
interface PlanItemFormProps {
  initialFields?: PlanItemFormFields
  submitLabel: string
  // splitParts is 1 for a normal add; >1 splits the cost into that many linked
  // items (the split-cost helper). Edit forms ignore it.
  onSubmit: (fields: PlanItemFormFields, splitParts: number) => Promise<void>
  onCancel?: () => void
  onAutoSave?: (fields: PlanItemFormFields) => Promise<void>
  error: string | null
  // 'inline' (default): title + actions share the top row (desktop quick-add /
  // inline edit). 'footer': title gets its own row and the actions sit in a
  // bottom bar — used inside the mobile bottom sheet.
  actionsPlacement?: 'inline' | 'footer'
}

export function PlanItemForm({
  initialFields,
  submitLabel,
  onSubmit,
  onCancel,
  onAutoSave,
  error,
  actionsPlacement = 'inline',
}: PlanItemFormProps) {
  const [fields, setFields] = useState<PlanItemFormFields>(initialFields ?? emptyFields())
  // Details start open when editing an item that already has extra fields set,
  // otherwise follow the user's remembered preference.
  const [expanded, setExpanded] = useState(
    () => (initialFields ? hasDetailValues(initialFields) : false) || readDetailsOpen(),
  )
  const [submitting, setSubmitting] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  // splitParts drives the split-cost helper (add mode only). 1 = no split.
  const [splitParts, setSplitParts] = useState(1)
  // splitPartsDraft holds the raw text while the user types so intermediate/empty
  // values aren't clamped away mid-keystroke; it's committed to splitParts on blur.
  const [splitPartsDraft, setSplitPartsDraft] = useState('')
  const optionalId = useId()
  const fid = useId()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Skip auto-save on the initial render so opening the edit form doesn't
  // immediately trigger a write.
  const isFirstRender = useRef(true)

  // Hold onAutoSave in a ref so the debounce effect below can depend on `fields`
  // alone. The callback's identity changes on unrelated parent re-renders (e.g.
  // after a save updates the parent's plan-items list, which hands down a fresh
  // onUpdated → a fresh onAutoSave); if that were a dependency, every such
  // re-render would reschedule the timer and a single edit could fire multiple
  // saves. Debouncing on the actual field changes is the correct behaviour.
  const onAutoSaveRef = useRef(onAutoSave)
  useEffect(() => {
    onAutoSaveRef.current = onAutoSave
  })

  useEffect(() => {
    if (!onAutoSaveRef.current) return
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    const timerId = setTimeout(async () => {
      if (!fields.title.trim()) return
      const autoSave = onAutoSaveRef.current
      if (!autoSave) return
      setSaveStatus('saving')
      try {
        await autoSave(fields)
        setSaveStatus('saved')
      } catch {
        setSaveStatus('error')
      }
    }, AUTO_SAVE_DEBOUNCE_MS)
    timerRef.current = timerId
    return () => {
      clearTimeout(timerId)
    }
  }, [fields])

  async function retryAutoSave() {
    if (!onAutoSave) return
    setSaveStatus('saving')
    try {
      await onAutoSave(fields)
      setSaveStatus('saved')
    } catch {
      setSaveStatus('error')
    }
  }

  function set(key: keyof PlanItemFormFields, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  // changeKind switches the item's behaviour and auto-suggests its budget
  // category — but only when the category is still empty or the previous kind's
  // default, so a manual override is preserved (cost stays decoupled). (M12.1 S5)
  function changeKind(next: PlanItemKind) {
    setFields((prev) => {
      const keepType = prev.type !== '' && prev.type !== suggestedCategory(prev.kind)
      return { ...prev, kind: next, type: keepType ? prev.type : suggestedCategory(next) }
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!fields.title.trim()) return
    setSubmitting(true)
    try {
      await onSubmit(fields, splitParts)
      // Reset after a successful quick-add (edit forms unmount on save instead).
      if (!initialFields) {
        setFields(emptyFields())
        setSplitParts(1)
        setSplitPartsDraft('')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const actions = (
    <>
      {onCancel && (
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={submitting}
          aria-label="Cancel"
        >
          Cancel
        </Button>
      )}
      <Button
        type="submit"
        variant="primary"
        disabled={submitting || !fields.title.trim()}
        aria-label={submitLabel}
      >
        {submitLabel}
      </Button>
    </>
  )

  return (
    <form className="plan-item-form" onSubmit={handleSubmit} aria-label="Plan item form">
      <div className="plan-item-form-row">
        <Input
          className="plan-item-form-title"
          type="text"
          placeholder="Add an activity, place or note…"
          value={fields.title}
          onChange={(e) => set('title', e.target.value)}
          required
          aria-label="Title"
          disabled={submitting}
          autoFocus={!!initialFields}
        />
        {actionsPlacement === 'inline' && actions}
      </div>

      {/* Kind picker: what the item *is* (activity / transport / food / note),
          which drives its fields and icon — separate from its budget category. */}
      <div className="plan-item-kind-picker" role="group" aria-label="Kind">
        {PLAN_ITEM_KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            className={[
              'plan-item-kind-btn',
              fields.kind === k.value ? 'plan-item-kind-btn--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-pressed={fields.kind === k.value}
            onClick={() => changeKind(k.value)}
            disabled={submitting}
          >
            <span aria-hidden="true">{k.glyph}</span> {k.label}
          </button>
        ))}
      </div>

      {/* The always-visible "where" composer depends on the kind: transport is a
          leg (from → to), a note has no place, everything else has a location. */}
      {fields.kind === 'transport' ? (
        <div className="plan-item-form-grid">
          <LocationField
            label="From"
            value={fields.origin}
            onChange={(v) => set('origin', v)}
            disabled={submitting}
            placeholder="Lisbon"
          />
          <LocationField
            label="To"
            value={fields.destination}
            onChange={(v) => set('destination', v)}
            disabled={submitting}
            placeholder="Porto"
          />
        </div>
      ) : fields.kind === 'note' ? null : (
        <LocationField
          value={fields.location}
          onChange={(v) => set('location', v)}
          disabled={submitting}
        />
      )}

      <button
        type="button"
        className="plan-item-form-toggle"
        onClick={() =>
          setExpanded((x) => {
            const next = !x
            try {
              localStorage.setItem(DETAILS_OPEN_KEY, next ? '1' : '0')
            } catch {
              // ignore storage failures — the toggle still works in-session
            }
            return next
          })
        }
        aria-expanded={expanded}
        aria-controls={optionalId}
      >
        <svg
          className={`plan-item-form-toggle-icon${expanded ? ' plan-item-form-toggle-icon--open' : ''}`}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            d="M6 9l6 6 6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {expanded ? 'Fewer details' : 'More details'}
      </button>

      {expanded && (
        <div className="plan-item-form-details" id={optionalId}>
          {/* A note has no time; transport has a departure + arrival; everything
              else has a start time + duration. */}
          {fields.kind !== 'note' && (
            <div className="plan-item-form-grid">
              <FormField
                label={fields.kind === 'transport' ? 'Departure' : 'Start time'}
                htmlFor={`${fid}-time`}
              >
                <Input
                  id={`${fid}-time`}
                  type="time"
                  value={fields.start_time}
                  onChange={(e) => set('start_time', e.target.value)}
                  disabled={submitting}
                />
              </FormField>
              {fields.kind === 'transport' ? (
                <FormField label="Arrival" htmlFor={`${fid}-arrive`}>
                  <Input
                    id={`${fid}-arrive`}
                    type="time"
                    value={fields.arrive_time}
                    onChange={(e) => set('arrive_time', e.target.value)}
                    disabled={submitting}
                  />
                </FormField>
              ) : (
                <FormField label="Duration" htmlFor={`${fid}-dur`}>
                  <Input
                    id={`${fid}-dur`}
                    type="text"
                    value={fields.duration}
                    onChange={(e) => set('duration', e.target.value)}
                    placeholder="e.g. 01:30"
                    disabled={submitting}
                  />
                </FormField>
              )}
            </div>
          )}

          {fields.kind !== 'note' && (
            <div className="plan-item-form-grid">
              <FormField label="Cost" htmlFor={`${fid}-cost`}>
                <Input
                  id={`${fid}-cost`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={fields.cost}
                  onChange={(e) => set('cost', e.target.value)}
                  placeholder="0.00"
                  disabled={submitting}
                />
                {/* Split is a special case of the cost just entered: divide it into
                  N linked items (e.g. a flight's separate bookings) that each
                  carry a share of the total. On add all N are created; on edit
                  the current item becomes part 1 and the rest are new siblings.
                  The Budget total is unchanged. Shown inline under the amount so
                  it's discoverable. */}
                {parseFloat(fields.cost) > 0 && (
                  <div className="cost-split">
                    <label className="cost-split-toggle">
                      <input
                        type="checkbox"
                        checked={splitParts > 1}
                        onChange={(e) => {
                          setSplitParts(e.target.checked ? 2 : 1)
                          setSplitPartsDraft(e.target.checked ? '2' : '')
                        }}
                        disabled={submitting}
                      />
                      Split this cost into several
                    </label>
                    {splitParts > 1 && (
                      <div className="cost-split-controls">
                        <Input
                          className="cost-split-count"
                          type="number"
                          min="2"
                          max={MAX_SPLIT_PARTS}
                          step="1"
                          value={splitPartsDraft}
                          onChange={(e) => {
                            // Let the user type freely (incl. clearing the field);
                            // only mirror valid, in-range numbers into splitParts so
                            // the "≈€ each" hint keeps up without clamping keystrokes.
                            const raw = e.target.value
                            setSplitPartsDraft(raw)
                            const n = Math.round(Number(raw))
                            if (raw.trim() !== '' && Number.isFinite(n) && n >= 2) {
                              setSplitParts(Math.min(MAX_SPLIT_PARTS, n))
                            }
                          }}
                          onBlur={() => {
                            // Commit: snap the draft back to the clamped source of
                            // truth so an empty/partial/out-of-range value resolves.
                            const n = Math.round(Number(splitPartsDraft))
                            const clamped =
                              splitPartsDraft.trim() !== '' && Number.isFinite(n)
                                ? Math.min(MAX_SPLIT_PARTS, Math.max(2, n))
                                : 2
                            setSplitParts(clamped)
                            setSplitPartsDraft(String(clamped))
                          }}
                          disabled={submitting}
                          aria-label="Number of parts to split the cost into"
                        />
                        <span className="cost-split-hint" aria-live="polite">
                          parts · ≈€{(parseFloat(fields.cost) / splitParts).toFixed(2)} each
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </FormField>
              <FormField label="Booking" htmlFor={`${fid}-book`}>
                <Input
                  id={`${fid}-book`}
                  type="text"
                  value={fields.booking_status}
                  onChange={(e) => set('booking_status', e.target.value)}
                  placeholder="e.g. confirmed"
                  disabled={submitting}
                />
              </FormField>
            </div>
          )}

          <div className="plan-item-form-grid">
            {/* Cost category is decoupled from kind — auto-suggested above, but
                freely overridable here. A note carries no budget category. */}
            {fields.kind !== 'note' && (
              <FormField label="Category" htmlFor={`${fid}-type`}>
                <Select
                  id={`${fid}-type`}
                  value={fields.type}
                  onChange={(e) => set('type', e.target.value)}
                  disabled={submitting}
                  aria-label="Category"
                >
                  <option value="">—</option>
                  {BUDGET_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}
            <FormField label="Link" htmlFor={`${fid}-link`}>
              <Input
                id={`${fid}-link`}
                type="url"
                value={fields.link}
                onChange={(e) => set('link', e.target.value)}
                placeholder="https://…"
                disabled={submitting}
              />
            </FormField>
          </div>

          <FormField label="Note" htmlFor={`${fid}-note`}>
            <textarea
              id={`${fid}-note`}
              className="plan-item-form-note"
              value={fields.note}
              onChange={(e) => set('note', e.target.value)}
              placeholder="How it went, who you were with…"
              rows={2}
              disabled={submitting}
            />
          </FormField>
        </div>
      )}

      {onAutoSave && saveStatus !== 'idle' && (
        <p
          className={`plan-item-save-status plan-item-save-status--${saveStatus}`}
          aria-live="polite"
          aria-label={
            saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : 'Save failed'
          }
        >
          {saveStatus === 'saving' && 'Saving…'}
          {saveStatus === 'saved' && 'Saved'}
          {saveStatus === 'error' && (
            <>
              Could not save.{' '}
              <button type="button" className="plan-item-save-retry" onClick={retryAutoSave}>
                Retry
              </button>
            </>
          )}
        </p>
      )}

      {error && (
        <p role="alert" className="plan-item-form-error">
          {error}
        </p>
      )}

      {actionsPlacement === 'footer' && <div className="plan-item-form-footer">{actions}</div>}
    </form>
  )
}

// QuickAddForm is the add form for a day. In the default (plan) mode it renders
// as an always-visible inline form on desktop and a "+" FAB → BottomSheet on
// mobile. In logDone mode it captures a thing you actually did — a "Log
// something you did" button reveals the same form (inline on desktop, sheet on
// mobile) and the created item is set to status "done" so it lands in the "what
// happened" group and, if it has a place, on the map.
//
// It is exported so the Ideas backlog can reuse the exact same add experience:
// passing dayId={null} creates a backlog item (no day assigned) through the same
// full-detail form, split-cost helper and offline path as a day. (M04.5)
export function QuickAddForm({
  tripId,
  dayId,
  onAdded,
  logDone = false,
}: {
  tripId: string
  dayId: string | null
  onAdded: (item: PlanItem) => void
  // logDone captures a done item (a thing you did) instead of a plan item.
  logDone?: boolean
}) {
  const mobile = useMobile()
  const online = useIsOnline()
  const [sheetOpen, setSheetOpen] = useState(false)
  // open drives the desktop inline disclosure in logDone mode (the plan form is
  // always visible; the log form hides behind its button until asked for).
  const [open, setOpen] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  function close() {
    setSheetOpen(false)
    setOpen(false)
    setAddError(null)
  }

  // handleLogDone creates an item and marks it done in one gesture. It uses a
  // client-generated id so the same row is targeted by both the create and the
  // set-status call online, and by both queued writes offline (replayed on
  // reconnect). Split is not offered when logging — a thing you did is one item.
  async function handleLogDone(fields: PlanItemFormFields) {
    setAddError(null)
    const input: PlanItemInput = {
      ...fieldsToInput(fields, dayId),
      id: crypto.randomUUID(),
      // Logged after the fact — not part of the intended plan, so it shows only
      // under "what happened", never in the Plan list.
      unplanned: true,
    }
    try {
      if (!online) {
        await enqueue('createPlanItem', { tripId, input })
        await enqueue('setPlanItemStatus', { tripId, itemId: input.id as string, status: 'done' })
        onAdded({ ...tempPlanItem(tripId, dayId, input), status: 'done' })
        close()
        return
      }
      const created = await createPlanItem(tripId, input)
      const done = await setPlanItemStatus(tripId, created.id, 'done')
      onAdded(done)
      close()
    } catch (err) {
      if (err instanceof PlanItemValidationError) setAddError(err.message)
      else setAddError('Could not log item.')
    }
  }

  async function handleAdd(fields: PlanItemFormFields, splitParts: number) {
    setAddError(null)
    const base = fieldsToInput(fields, dayId)
    // Expand a split into one input per part: divide the cost to the cent and
    // suffix each title with "(part k/n)". A split of 1 (or with no positive
    // cost) is a single plain item — the common case.
    const inputs: PlanItemInput[] =
      splitParts > 1 && base.cost != null && base.cost > 0
        ? splitAmount(base.cost, splitParts).map((amount, i) => ({
            ...base,
            title: `${base.title} (part ${i + 1}/${splitParts})`,
            cost: amount,
          }))
        : [base]
    try {
      if (!online) {
        // Offline: queue each create as an idempotent write (replayed on
        // reconnect via the single shared queue — same mechanism as Journal and
        // Budget) and synthesise a temp item so the plan reflects it immediately.
        for (const input of inputs) {
          await enqueue('createPlanItem', { tripId, input })
          onAdded(tempPlanItem(tripId, dayId, input))
        }
        if (mobile) setSheetOpen(false)
        return
      }
      for (const input of inputs) {
        const item = await createPlanItem(tripId, input)
        onAdded(item)
      }
      if (mobile) setSheetOpen(false)
    } catch (err) {
      if (err instanceof PlanItemValidationError) {
        setAddError(err.message)
      } else {
        setAddError('Could not add item.')
      }
    }
  }

  const submit = logDone ? (fields: PlanItemFormFields) => handleLogDone(fields) : handleAdd
  const submitLabel = logDone ? 'Log it' : 'Add to plan'

  if (mobile) {
    return (
      <>
        <button
          type="button"
          className={logDone ? 'plan-log-btn' : 'plan-item-fab'}
          aria-label={logDone ? 'Log something you did' : 'Add activity'}
          onClick={() => setSheetOpen(true)}
        >
          {logDone ? '+ Log something you did' : '+'}
        </button>
        <BottomSheet
          open={sheetOpen}
          onClose={close}
          label={logDone ? 'Log something you did' : 'Add to plan'}
        >
          <PlanItemForm
            submitLabel={submitLabel}
            onSubmit={submit}
            error={addError}
            actionsPlacement="footer"
            onCancel={close}
          />
        </BottomSheet>
      </>
    )
  }

  // Desktop: the plan form is always visible; the log form hides behind a button.
  if (logDone && !open) {
    return (
      <button
        type="button"
        className="plan-log-btn"
        aria-label="Log something you did"
        onClick={() => setOpen(true)}
      >
        + Log something you did
      </button>
    )
  }

  return (
    <div className="plan-item-quick-add">
      <PlanItemForm
        submitLabel={logDone ? submitLabel : 'Add'}
        onSubmit={submit}
        error={addError}
        onCancel={logDone ? close : undefined}
      />
    </div>
  )
}

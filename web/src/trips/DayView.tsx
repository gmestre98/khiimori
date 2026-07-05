import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useParams } from 'react-router-dom'
import { useFocusTrap } from '../components/ui/useFocusTrap'
import { Button, FormField, Input, Select } from '../components/ui'
import { collectLocatedItems } from './locatedItems'
import {
  PlanItemValidationError,
  UnauthorizedError,
  createPlanItem,
  demotePlanItem,
  fetchAutocomplete,
  fetchBudgetRollup,
  fetchDay,
  geocodeLocation,
  movePlanItem,
  reorderPlanItems,
  setPlanItemStatus,
  updatePlanItem,
  datesInRange,
  BUDGET_CATEGORIES,
  type BudgetLine,
  type BudgetRollup,
  type CostEntry,
  type Day,
  type PlanItem,
  type PlanItemInput,
  type Stay,
  type Suggestion,
} from '../lib/api'
import { fullDate } from '../lib/format'
import { enqueue } from '../lib/mutationQueue'
import { useIsOnline } from '../lib/useIsOnline'
import { JournalEditor } from '../journal/JournalEditor'
import { DayBudgetEditor } from './BudgetEditor'
import { FastAddCost } from './FastAddCost'
import { DayRollup } from './RollupDisplay'
import { useTripShell } from './useTripShell'

const DayMap = lazy(() => import('./DayMap'))

// BottomSheet renders children in a bottom-anchored sliding panel on mobile
// (viewport ≤ 640 px). On wider viewports the children render inline with no
// wrapper — callers do not need to know which mode is active.
function BottomSheet({
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

// useMobile returns true when the viewport width is ≤ 640 px and tracks
// changes so components re-render on orientation / resize.
function useMobile(): boolean {
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 640px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return mobile
}

// statusLabel maps a plan item status to a human-readable label.
function statusLabel(status: string): string {
  switch (status) {
    case 'done':
      return 'Done'
    case 'skipped':
      return 'Skipped'
    case 'cancelled':
      return 'Cancelled'
    default:
      return ''
  }
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// PlanItemFormFields holds the raw string values of the optional fields in the
// add/edit form. We use strings throughout so controlled inputs work without
// type coercion; numeric fields are parsed on submit.
interface PlanItemFormFields {
  title: string
  type: string
  start_time: string
  duration: string
  location: string
  booking_status: string
  cost: string
  link: string
}

function emptyFields(): PlanItemFormFields {
  return {
    title: '',
    type: '',
    start_time: '',
    duration: '',
    location: '',
    booking_status: '',
    cost: '',
    link: '',
  }
}

// DETAILS_OPEN_KEY persists the "More details" disclosure so the extra fields
// stay open once a user has chosen to see them — no re-clicking on every add.
const DETAILS_OPEN_KEY = 'khiimori:planDetailsOpen'

// hasDetailValues reports whether any of the fields tucked behind "More details"
// are set. Title and Location live in the always-visible composer, so they're
// excluded. Used to auto-open the disclosure when editing an item that has them.
function hasDetailValues(f: PlanItemFormFields): boolean {
  return !!(f.type || f.start_time || f.duration || f.booking_status || f.cost || f.link)
}

function readDetailsOpen(): boolean {
  try {
    return localStorage.getItem(DETAILS_OPEN_KEY) === '1'
  } catch {
    return false
  }
}

function fieldsFromItem(item: PlanItem): PlanItemFormFields {
  return {
    title: item.title,
    type: item.type ?? '',
    start_time: item.start_time ? item.start_time.slice(0, 5) : '',
    duration: item.duration ?? '',
    location: item.location ?? '',
    booking_status: item.booking_status ?? '',
    cost: item.cost != null ? String(item.cost) : '',
    link: item.link ?? '',
  }
}

// tempPlanItem synthesises a client-side plan item for an offline add so the day
// reflects it immediately. The real row is created server-side when the queued
// mutation replays on reconnect; this temp item carries a fresh client id and a
// large sort_order so it sorts to the end (mirrors FastAddCost's offline entry).
// A page reload after sync then shows the authoritative server item.
function tempPlanItem(tripId: string, dayId: string | null, input: PlanItemInput): PlanItem {
  return {
    id: crypto.randomUUID(),
    trip_id: tripId,
    day_id: dayId ?? undefined,
    title: input.title,
    type: input.type ?? undefined,
    start_time: input.start_time ?? undefined,
    duration: input.duration ?? undefined,
    location: input.location ?? undefined,
    booking_status: input.booking_status ?? undefined,
    cost: input.cost ?? undefined,
    link: input.link ?? undefined,
    sort_order: Number.MAX_SAFE_INTEGER,
    status: 'planned',
  }
}

function fieldsToInput(
  fields: PlanItemFormFields,
  dayId: string | null | undefined,
): PlanItemInput {
  return {
    title: fields.title.trim(),
    day_id: dayId ?? null,
    type: fields.type.trim() || null,
    start_time: fields.start_time.trim() || null,
    duration: fields.duration.trim() || null,
    location: fields.location.trim() || null,
    booking_status: fields.booking_status.trim() || null,
    cost: fields.cost.trim() ? parseFloat(fields.cost) : null,
    link: fields.link.trim() || null,
  }
}

// MAX_SPLIT_LEGS caps how many legs a single cost can be split into — keeps the
// "split a flight" helper sane (a handful of legs, not hundreds).
const MAX_SPLIT_LEGS = 12

// splitAmount divides a total across n legs so the per-leg amounts sum back to
// the exact total to the cent. Any rounding remainder is spread one cent at a
// time across the first legs (e.g. 10 / 3 → [3.34, 3.33, 3.33]).
export function splitAmount(total: number, n: number): number[] {
  const totalCents = Math.round(total * 100)
  const base = Math.floor(totalCents / n)
  const remainder = totalCents - base * n
  return Array.from({ length: n }, (_, i) => (base + (i < remainder ? 1 : 0)) / 100)
}

// AUTO_SAVE_DEBOUNCE_MS is the delay before a pending edit is flushed to the
// server. Kept short enough to feel instant but long enough to coalesce rapid
// keystrokes into a single write.
const AUTO_SAVE_DEBOUNCE_MS = 800

// GEOCODE_DEBOUNCE_MS delays the live location check while the user is still
// typing so we issue one geocode per pause rather than one per keystroke.
const GEOCODE_DEBOUNCE_MS = 600

// SUGGEST_DEBOUNCE_MS / SUGGEST_MIN_CHARS tune the autocomplete: fire a snappy
// request after a short pause, but only once there's enough to match against
// (avoids noisy one/two-letter queries and needless Places billing).
const SUGGEST_DEBOUNCE_MS = 250
const SUGGEST_MIN_CHARS = 3

// GeoResult is the outcome of a completed geocode check, keyed by the exact
// query string it was run for so a stale result (from an earlier keystroke)
// isn't shown against newer input.
type GeoResult = { query: string; kind: 'found' | 'notfound' | 'unchecked' }

// LocationField is a combobox: as the user types it offers place suggestions
// (Google Places via the geo proxy) and, in parallel, runs a live geocode check
// that surfaces a small status line ("Found" / "couldn't place this"). Picking a
// suggestion fills the exact place string, so what lands on the map is never a
// surprise. Advisory only — saving is never blocked.
function LocationField({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  // Only async results live in state; immediate idle/checking states are derived
  // during render so effects never call setState synchronously.
  const [result, setResult] = useState<GeoResult | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  // After a suggestion is chosen, skip the next fetch so the list doesn't
  // immediately reopen against the value we just filled in.
  const justSelected = useRef(false)
  // Skip the first suggestions fetch so opening the edit form for an item that
  // already has a location doesn't pop the dropdown before the user types.
  const skipInitialSuggest = useRef(true)
  const inputId = useId()
  const hintId = useId()
  const listboxId = useId()

  const trimmed = value.trim()

  // Live geocode feedback.
  useEffect(() => {
    if (!trimmed) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      geocodeLocation(trimmed, controller.signal)
        .then((coords) => {
          if (controller.signal.aborted) return
          setResult({ query: trimmed, kind: coords ? 'found' : 'notfound' })
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return
          // Auth failures and transient errors shouldn't be shown as "not a real
          // place" — fall back to a neutral state.
          setResult({ query: trimmed, kind: 'unchecked' })
        })
    }, GEOCODE_DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [trimmed])

  // Place suggestions.
  useEffect(() => {
    if (skipInitialSuggest.current) {
      skipInitialSuggest.current = false
      return
    }
    if (justSelected.current) {
      justSelected.current = false
      return
    }
    if (trimmed.length < SUGGEST_MIN_CHARS) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetchAutocomplete(trimmed, controller.signal)
        .then((list) => {
          if (controller.signal.aborted) return
          setSuggestions(list)
          setActiveIdx(-1)
          setOpen(list.length > 0)
        })
        .catch(() => {
          // A failed suggestion fetch is non-critical — the field still works.
        })
    }, SUGGEST_DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [trimmed])

  function selectSuggestion(s: Suggestion) {
    justSelected.current = true
    onChange(s.description)
    setSuggestions([])
    setOpen(false)
    setActiveIdx(-1)
  }

  function handleChange(next: string) {
    onChange(next)
    if (next.trim().length < SUGGEST_MIN_CHARS) {
      setSuggestions([])
      setOpen(false)
    } else {
      setOpen(true)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) {
      if (e.key === 'ArrowDown' && suggestions.length > 0) {
        setOpen(true)
        setActiveIdx(0)
        e.preventDefault()
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIdx((i) => (i + 1) % suggestions.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
        break
      case 'Enter':
        if (activeIdx >= 0) {
          // Prevent the Enter from submitting the plan form.
          e.preventDefault()
          selectSuggestion(suggestions[activeIdx])
        }
        break
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        break
    }
  }

  // Derive what to show: idle when empty, the matched result once it lands, and
  // "checking" in between (typing, or waiting on a result for the current query).
  const statusKind: 'idle' | 'checking' | 'found' | 'notfound' | 'unchecked' = !trimmed
    ? 'idle'
    : result?.query === trimmed
      ? result.kind
      : 'checking'

  const showList = open && suggestions.length > 0

  return (
    <div className="form-field location-field">
      <label className="form-field-label" htmlFor={inputId}>
        Location
      </label>
      <div className="location-combobox">
        <input
          id={inputId}
          className="form-input"
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={() => setOpen(false)}
          placeholder="e.g. Louvre, Paris"
          disabled={disabled}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            showList && activeIdx >= 0 ? `${listboxId}-opt-${activeIdx}` : undefined
          }
          aria-describedby={hintId}
        />
        {showList && (
          <ul className="location-suggestions" id={listboxId} role="listbox">
            {suggestions.map((s, i) => (
              <li
                key={s.place_id || s.description}
                id={`${listboxId}-opt-${i}`}
                role="option"
                aria-selected={i === activeIdx}
                className={[
                  'location-suggestion',
                  i === activeIdx ? 'location-suggestion--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                // Keep focus on the input so onBlur doesn't close before click.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectSuggestion(s)}
              >
                {s.description}
              </li>
            ))}
          </ul>
        )}
      </div>
      <span
        id={hintId}
        className={`location-status location-status--${statusKind}`}
        aria-live="polite"
      >
        {statusKind === 'idle' && 'Add a place to pin it on the day’s map.'}
        {statusKind === 'checking' && 'Checking location…'}
        {statusKind === 'found' && '✓ Found — this will show on the map.'}
        {statusKind === 'notfound' &&
          '⚠ We couldn’t place this. Try adding a city or country, e.g. “Louvre, Paris”.'}
        {statusKind === 'unchecked' && 'Saved — we’ll place it on the map when we can.'}
      </span>
    </div>
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
  // splitLegs is 1 for a normal add; >1 splits the cost into that many linked
  // items (the "split a flight" helper). Edit forms ignore it.
  onSubmit: (fields: PlanItemFormFields, splitLegs: number) => Promise<void>
  onCancel?: () => void
  onAutoSave?: (fields: PlanItemFormFields) => Promise<void>
  error: string | null
  // 'inline' (default): title + actions share the top row (desktop quick-add /
  // inline edit). 'footer': title gets its own row and the actions sit in a
  // bottom bar — used inside the mobile bottom sheet.
  actionsPlacement?: 'inline' | 'footer'
}

function PlanItemForm({
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
  // splitLegs drives the "split a flight" helper (add mode only). 1 = no split.
  const [splitLegs, setSplitLegs] = useState(1)
  const optionalId = useId()
  const fid = useId()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Skip auto-save on the initial render so opening the edit form doesn't
  // immediately trigger a write.
  const isFirstRender = useRef(true)

  useEffect(() => {
    if (!onAutoSave) return
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    const timerId = setTimeout(async () => {
      if (!fields.title.trim()) return
      setSaveStatus('saving')
      try {
        await onAutoSave(fields)
        setSaveStatus('saved')
      } catch {
        setSaveStatus('error')
      }
    }, AUTO_SAVE_DEBOUNCE_MS)
    timerRef.current = timerId
    return () => {
      clearTimeout(timerId)
    }
  }, [fields, onAutoSave])

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!fields.title.trim()) return
    setSubmitting(true)
    try {
      await onSubmit(fields, splitLegs)
      // Reset after a successful quick-add (edit forms unmount on save instead).
      if (!initialFields) {
        setFields(emptyFields())
        setSplitLegs(1)
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

      {/* Location lives in the always-visible composer — a "stop" is a place, so
          it shouldn't require opening "More details" first. */}
      <LocationField
        value={fields.location}
        onChange={(v) => set('location', v)}
        disabled={submitting}
      />

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
          <div className="plan-item-form-grid">
            <FormField label="Start time" htmlFor={`${fid}-time`}>
              <Input
                id={`${fid}-time`}
                type="time"
                value={fields.start_time}
                onChange={(e) => set('start_time', e.target.value)}
                disabled={submitting}
              />
            </FormField>
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
          </div>

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

          {/* Split helper: only on add, and only meaningful once a cost is set.
              Splits the cost into N linked items (e.g. a flight's legs), each
              landing under the same category so the Budget total is unchanged. */}
          {!initialFields && parseFloat(fields.cost) > 0 && (
            <div className="plan-item-form-split">
              <FormField label="Split cost into legs" htmlFor={`${fid}-split`}>
                <Input
                  id={`${fid}-split`}
                  type="number"
                  min="1"
                  max={MAX_SPLIT_LEGS}
                  step="1"
                  value={String(splitLegs)}
                  onChange={(e) => {
                    const n = Math.round(Number(e.target.value))
                    setSplitLegs(Number.isFinite(n) ? Math.min(MAX_SPLIT_LEGS, Math.max(1, n)) : 1)
                  }}
                  disabled={submitting}
                  aria-label="Split cost into legs"
                />
              </FormField>
              {splitLegs > 1 && (
                <p className="plan-item-form-split-hint" aria-live="polite">
                  Creates {splitLegs} items · ≈€{(parseFloat(fields.cost) / splitLegs).toFixed(2)}{' '}
                  each
                </p>
              )}
            </div>
          )}

          <div className="plan-item-form-grid">
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

// MoveToDayPicker is the inline day-picker shown when the user clicks "Move…"
// on a plan item. It fetches the target day to resolve date → UUID and calls
// movePlanItem on confirm.
function MoveToDayPicker({
  tripId,
  item,
  tripDates,
  currentDate,
  onMoved,
  onCancel,
}: {
  tripId: string
  item: PlanItem
  tripDates: string[]
  currentDate: string
  onMoved: (itemId: string) => void
  onCancel: () => void
}) {
  const otherDates = tripDates.filter((d) => d !== currentDate)
  const [selectedDate, setSelectedDate] = useState(otherDates[0] ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleMove() {
    if (!selectedDate) return
    setBusy(true)
    setError(null)
    try {
      const targetDay = await fetchDay(tripId, selectedDate)
      await movePlanItem(tripId, item.id, targetDay.id)
      onMoved(item.id)
    } catch {
      setError('Could not move item.')
    } finally {
      setBusy(false)
    }
  }

  if (otherDates.length === 0) {
    return (
      <span className="plan-item-move-picker">
        <span className="plan-item-move-picker-empty">No other days in trip.</span>
        <button type="button" className="plan-item-move-cancel" onClick={onCancel}>
          Cancel
        </button>
      </span>
    )
  }

  return (
    <span className="plan-item-move-picker">
      <select
        className="plan-item-move-select"
        value={selectedDate}
        onChange={(e) => setSelectedDate(e.target.value)}
        disabled={busy}
        aria-label="Target day"
      >
        {otherDates.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="plan-item-move-confirm"
        onClick={handleMove}
        disabled={busy || !selectedDate}
      >
        Move
      </button>
      <button type="button" className="plan-item-move-cancel" onClick={onCancel} disabled={busy}>
        Cancel
      </button>
      {error && (
        <span role="alert" className="plan-item-move-error">
          {error}
        </span>
      )}
    </span>
  )
}

// PlanItemRow renders a single plan item and enters inline-edit mode on click.
// It also exposes status, move-to-day, and demote-to-backlog affordances.
// On mobile the edit form opens in a BottomSheet; touch reorder uses up/down buttons.
function PlanItemRow({
  item,
  tripId,
  day,
  tripDates,
  draggable: isDraggable,
  isSelected,
  pinNumber,
  onSelect,
  onUpdated,
  onRemoved,
  onDragStart,
  onDragOver,
  onDrop,
  onMoveUp,
  onMoveDown,
}: {
  item: PlanItem
  tripId: string
  day: Day
  tripDates: string[]
  draggable?: boolean
  isSelected?: boolean
  pinNumber?: number
  onSelect?: () => void
  onUpdated: (updated: PlanItem) => void
  onRemoved: (itemId: string) => void
  onDragStart?: (e: React.DragEvent, itemId: string) => void
  onDragOver?: (e: React.DragEvent, itemId: string) => void
  onDrop?: (e: React.DragEvent, itemId: string) => void
  onMoveUp?: () => void
  onMoveDown?: () => void
}) {
  const mobile = useMobile()
  const [editing, setEditing] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [showMovePicker, setShowMovePicker] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const [demoteBusy, setDemoteBusy] = useState(false)
  const rowRef = useRef<HTMLLIElement>(null)

  // Scroll the row into view when it becomes selected via a pin tap.
  useEffect(() => {
    if (isSelected) {
      rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [isSelected])

  const isDone = item.status === 'done'
  const isSkipped = item.status === 'skipped'
  const isCancelled = item.status === 'cancelled'
  const inactive = isSkipped || isCancelled
  const label = statusLabel(item.status)

  async function handleSave(fields: PlanItemFormFields) {
    setEditError(null)
    try {
      const updated = await updatePlanItem(tripId, item.id, fieldsToInput(fields, item.day_id))
      onUpdated(updated)
      setEditing(false)
    } catch (err) {
      if (err instanceof PlanItemValidationError) {
        setEditError(err.message)
      } else {
        setEditError('Could not save changes.')
      }
    }
  }

  const handleAutoSave = useCallback(
    async (fields: PlanItemFormFields) => {
      const updated = await updatePlanItem(tripId, item.id, fieldsToInput(fields, item.day_id))
      onUpdated(updated)
    },
    [tripId, item.id, item.day_id, onUpdated],
  )

  async function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value
    setStatusBusy(true)
    try {
      const updated = await setPlanItemStatus(tripId, item.id, newStatus)
      onUpdated(updated)
    } catch {
      // leave status unchanged on failure
    } finally {
      setStatusBusy(false)
    }
  }

  async function handleDemote() {
    setDemoteBusy(true)
    try {
      await demotePlanItem(tripId, item.id)
      onRemoved(item.id)
    } catch {
      setDemoteBusy(false)
    }
  }

  const editForm = (
    <PlanItemForm
      initialFields={fieldsFromItem(item)}
      submitLabel="Save"
      onSubmit={handleSave}
      onCancel={() => {
        setEditing(false)
        setEditError(null)
      }}
      onAutoSave={handleAutoSave}
      error={editError}
      actionsPlacement={mobile ? 'footer' : 'inline'}
    />
  )

  if (editing && mobile) {
    return (
      <>
        {/* Keep the item row visible behind the sheet */}
        <li className="plan-item" aria-label={item.title}>
          <div className="plan-item-main">
            <span className="plan-item-title">{item.title}</span>
          </div>
        </li>
        <BottomSheet
          open
          onClose={() => {
            setEditing(false)
            setEditError(null)
          }}
          label={`Edit ${item.title}`}
        >
          {editForm}
        </BottomSheet>
      </>
    )
  }

  if (editing) {
    return <li className="plan-item plan-item--editing">{editForm}</li>
  }

  return (
    <li
      ref={rowRef}
      className={[
        'plan-item',
        isDone ? 'plan-item--done' : '',
        isSkipped ? 'plan-item--skipped' : '',
        isCancelled ? 'plan-item--cancelled' : '',
        isDraggable ? 'plan-item--draggable' : '',
        isSelected ? 'plan-item--selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={item.title + (label ? ` — ${label}` : '')}
      draggable={isDraggable}
      onDragStart={isDraggable && onDragStart ? (e) => onDragStart(e, item.id) : undefined}
      onDragOver={isDraggable && onDragOver ? (e) => onDragOver(e, item.id) : undefined}
      onDrop={isDraggable && onDrop ? (e) => onDrop(e, item.id) : undefined}
    >
      <div className="plan-item-main">
        {isDraggable && !mobile && (
          <span className="plan-item-drag-handle" aria-hidden="true">
            ⠿
          </span>
        )}
        {isDraggable && mobile && (
          <div className="plan-item-touch-reorder" aria-label="Reorder">
            <button
              type="button"
              className="plan-item-reorder-btn"
              onClick={onMoveUp}
              disabled={!onMoveUp}
              aria-label={`Move ${item.title} up`}
            >
              ↑
            </button>
            <button
              type="button"
              className="plan-item-reorder-btn"
              onClick={onMoveDown}
              disabled={!onMoveDown}
              aria-label={`Move ${item.title} down`}
            >
              ↓
            </button>
          </div>
        )}
        {pinNumber != null && onSelect && (
          <button
            type="button"
            className={['plan-item-pin-badge', isSelected ? 'plan-item-pin-badge--selected' : '']
              .filter(Boolean)
              .join(' ')}
            aria-label={`Map pin ${pinNumber} for ${item.title}`}
            aria-pressed={isSelected}
            onClick={onSelect}
          >
            {pinNumber}
          </button>
        )}
        <button
          type="button"
          className="plan-item-edit-btn"
          aria-label={`Edit ${item.title}`}
          onClick={() => setEditing(true)}
        >
          {item.start_time && (
            <span className="plan-item-time" aria-label={`Start time: ${item.start_time}`}>
              {item.start_time.slice(0, 5)}
            </span>
          )}
          <span className="plan-item-title" style={inactive ? { opacity: 0.5 } : undefined}>
            {item.title}
          </span>
          {item.location && <span className="plan-item-location">{item.location}</span>}
          {label && <span className="plan-item-status-badge">{label}</span>}
        </button>
      </div>

      <div className="plan-item-actions">
        <select
          className="plan-item-status-select"
          value={item.status}
          onChange={handleStatusChange}
          disabled={statusBusy}
          aria-label={`Status: ${item.status}`}
        >
          <option value="planned">Planned</option>
          <option value="done">Done</option>
          <option value="skipped">Skipped</option>
          <option value="cancelled">Cancelled</option>
        </select>

        {showMovePicker ? (
          <MoveToDayPicker
            tripId={tripId}
            item={item}
            tripDates={tripDates}
            currentDate={day.date}
            onMoved={(id) => {
              setShowMovePicker(false)
              onRemoved(id)
            }}
            onCancel={() => setShowMovePicker(false)}
          />
        ) : (
          <button
            type="button"
            className="plan-item-move-btn"
            onClick={() => setShowMovePicker(true)}
            aria-label={`Move ${item.title} to another day`}
          >
            Move…
          </button>
        )}

        <button
          type="button"
          className="plan-item-demote-btn"
          onClick={handleDemote}
          disabled={demoteBusy}
          aria-label={`Move ${item.title} to backlog`}
        >
          → Backlog
        </button>
      </div>
    </li>
  )
}

// QuickAddForm is the inline add form shown at the bottom of the planning
// section. On mobile it renders as a large "+" FAB button that opens a
// BottomSheet; on desktop the form is always visible inline.
function QuickAddForm({
  tripId,
  dayId,
  onAdded,
}: {
  tripId: string
  dayId: string | null
  onAdded: (item: PlanItem) => void
}) {
  const mobile = useMobile()
  const online = useIsOnline()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  async function handleAdd(fields: PlanItemFormFields, splitLegs: number) {
    setAddError(null)
    const base = fieldsToInput(fields, dayId)
    // Expand a split into one input per leg: divide the cost to the cent and
    // suffix each title with "(leg k/n)". A split of 1 (or with no positive
    // cost) is a single plain item — the common case.
    const inputs: PlanItemInput[] =
      splitLegs > 1 && base.cost != null && base.cost > 0
        ? splitAmount(base.cost, splitLegs).map((amount, i) => ({
            ...base,
            title: `${base.title} (leg ${i + 1}/${splitLegs})`,
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

  if (mobile) {
    return (
      <>
        <button
          type="button"
          className="plan-item-fab"
          aria-label="Add activity"
          onClick={() => setSheetOpen(true)}
        >
          +
        </button>
        <BottomSheet
          open={sheetOpen}
          onClose={() => {
            setSheetOpen(false)
            setAddError(null)
          }}
          label="Add to plan"
        >
          <PlanItemForm
            submitLabel="Add to plan"
            onSubmit={handleAdd}
            error={addError}
            actionsPlacement="footer"
            onCancel={() => {
              setSheetOpen(false)
              setAddError(null)
            }}
          />
        </BottomSheet>
      </>
    )
  }

  return (
    <div className="plan-item-quick-add">
      <PlanItemForm submitLabel="Add" onSubmit={handleAdd} error={addError} />
    </div>
  )
}

// TimedSection renders plan items that have a start_time in chronological order.
function TimedSection({
  items,
  tripId,
  day,
  tripDates,
  selectedId,
  pinNumberForId,
  onSelect,
  onUpdated,
  onRemoved,
}: {
  items: PlanItem[]
  tripId: string
  day: Day
  tripDates: string[]
  selectedId?: string | null
  pinNumberForId?: (id: string) => number | undefined
  onSelect?: (id: string | null) => void
  onUpdated: (updated: PlanItem) => void
  onRemoved: (itemId: string) => void
}) {
  if (items.length === 0) return null
  return (
    <section className="day-plan-section day-plan-section--timed" aria-label="Timed activities">
      <h3 className="day-plan-section-title">Schedule</h3>
      <ol className="plan-item-list">
        {items.map((item) => (
          <PlanItemRow
            key={item.id}
            item={item}
            tripId={tripId}
            day={day}
            tripDates={tripDates}
            isSelected={selectedId === item.id}
            pinNumber={pinNumberForId?.(item.id)}
            onSelect={
              onSelect ? () => onSelect(selectedId === item.id ? null : item.id) : undefined
            }
            onUpdated={onUpdated}
            onRemoved={onRemoved}
          />
        ))}
      </ol>
    </section>
  )
}

// UntimedSection renders untimed plan items as a draggable loose list.
// Drag-reorder calls the reorder API with the new combined item order for the day.
function UntimedSection({
  items,
  timedItems,
  tripId,
  day,
  tripDates,
  selectedId,
  pinNumberForId,
  onSelect,
  onUpdated,
  onRemoved,
  onReordered,
}: {
  items: PlanItem[]
  timedItems: PlanItem[]
  tripId: string
  day: Day
  tripDates: string[]
  selectedId?: string | null
  pinNumberForId?: (id: string) => number | undefined
  onSelect?: (id: string | null) => void
  onUpdated: (updated: PlanItem) => void
  onRemoved: (itemId: string) => void
  onReordered: (newUntimed: PlanItem[]) => void
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null)

  function handleDragStart(e: React.DragEvent, itemId: string) {
    setDraggingId(itemId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', itemId)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault()
    const sourceId = e.dataTransfer.getData('text/plain') || draggingId
    if (!sourceId || sourceId === targetId) {
      setDraggingId(null)
      return
    }

    const sourceIdx = items.findIndex((i) => i.id === sourceId)
    const targetIdx = items.findIndex((i) => i.id === targetId)
    if (sourceIdx === -1 || targetIdx === -1) {
      setDraggingId(null)
      return
    }

    const reordered = [...items]
    const [moved] = reordered.splice(sourceIdx, 1)
    reordered.splice(targetIdx, 0, moved)

    // Snapshot before-state so the revert below is scoped to this drag.
    const snapshot = items

    // Optimistic update; revert handled via onReordered if server fails.
    onReordered(reordered)
    setDraggingId(null)

    // Full day order: timed first (current server order), then untimed in new order.
    const allIds = [...timedItems.map((i) => i.id), ...reordered.map((i) => i.id)]
    reorderPlanItems(tripId, day.id, allIds).catch(() => {
      // Revert to the order before *this* drag only.
      onReordered(snapshot)
    })
  }

  function handleTouchReorder(idx: number, direction: 'up' | 'down') {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= items.length) return
    const reordered = [...items]
    ;[reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]]
    const snapshot = items
    onReordered(reordered)
    const allIds = [...timedItems.map((i) => i.id), ...reordered.map((i) => i.id)]
    reorderPlanItems(tripId, day.id, allIds).catch(() => {
      onReordered(snapshot)
    })
  }

  if (items.length === 0) return null
  return (
    <section className="day-plan-section day-plan-section--untimed" aria-label="Untimed activities">
      <h3 className="day-plan-section-title">Activities</h3>
      <ul className="plan-item-list">
        {items.map((item, idx) => (
          <PlanItemRow
            key={item.id}
            item={item}
            tripId={tripId}
            day={day}
            tripDates={tripDates}
            draggable
            isSelected={selectedId === item.id}
            pinNumber={pinNumberForId?.(item.id)}
            onSelect={
              onSelect ? () => onSelect(selectedId === item.id ? null : item.id) : undefined
            }
            onUpdated={onUpdated}
            onRemoved={onRemoved}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onMoveUp={idx > 0 ? () => handleTouchReorder(idx, 'up') : undefined}
            onMoveDown={idx < items.length - 1 ? () => handleTouchReorder(idx, 'down') : undefined}
          />
        ))}
      </ul>
    </section>
  )
}

// StaysSection renders accommodation stays covering this day.
function StaysSection({
  stays,
  selectedId,
  pinNumberForId,
  onSelect,
}: {
  stays: Stay[]
  selectedId?: string | null
  pinNumberForId?: (id: string) => number | undefined
  onSelect?: (id: string | null) => void
}) {
  if (stays.length === 0) return null
  return (
    <section className="day-stays-section" aria-label="Accommodation">
      <h3 className="day-stays-section-title">Staying</h3>
      <ul className="stay-list">
        {stays.map((stay) => {
          const pinNumber = pinNumberForId?.(stay.id)
          const isSelected = selectedId === stay.id
          return (
            <li
              key={stay.id}
              className={['stay-item', isSelected ? 'stay-item--selected' : '']
                .filter(Boolean)
                .join(' ')}
            >
              <div className="stay-item-main">
                {pinNumber != null && onSelect && (
                  <button
                    type="button"
                    className={[
                      'plan-item-pin-badge',
                      isSelected ? 'plan-item-pin-badge--selected' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-label={`Map pin ${pinNumber} for ${stay.name}`}
                    aria-pressed={isSelected}
                    onClick={() => onSelect(isSelected ? null : stay.id)}
                  >
                    {pinNumber}
                  </button>
                )}
                <div className="stay-name">{stay.name}</div>
              </div>
              {stay.location && <div className="stay-location">{stay.location}</div>}
              {stay.check_in && stay.check_out && (
                <div
                  className="stay-dates"
                  aria-label={`Check in ${stay.check_in}, check out ${stay.check_out}`}
                >
                  {stay.check_in} – {stay.check_out}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// BacklogLink renders a link/button to access the ideas backlog for the trip.
function BacklogLink({ tripId }: { tripId: string }) {
  return (
    <section className="day-backlog-section" aria-label="Ideas backlog">
      <Link
        to={`/trips/${tripId}/backlog`}
        className="day-backlog-link"
        aria-label="View ideas backlog"
      >
        💡 Ideas backlog
      </Link>
    </section>
  )
}

// PlanningSection replaces the old PlanningSlot placeholder with real content:
// stays, timed items, untimed items, quick-add form, and a link to the ideas
// backlog. Re-planning affordances (reorder, move, demote, status) are wired
// to the Epic 03–04 API operations.
function PlanningSection({
  day,
  items,
  setItems,
  tripId,
  selectedId,
  onSelect,
}: {
  day: Day
  // items / setItems are owned by DayView so the map stays in sync with edits.
  items: PlanItem[]
  setItems: React.Dispatch<React.SetStateAction<PlanItem[]>>
  tripId: string
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  const { trip } = useTripShell()
  const tripDates = datesInRange(trip.start_date, trip.end_date)

  const timed = items.filter((item) => item.start_time != null)
  const untimed = items.filter((item) => item.start_time == null)

  // Build a lookup from item/stay id → pin number (1-based) using the same
  // ordering as collectLocatedItems so badges match the map legend.
  const locatedItems = collectLocatedItems({ ...day, plan_items: items })
  const pinNumberForId = (id: string): number | undefined => {
    const idx = locatedItems.findIndex((li) => li.id === id)
    return idx >= 0 ? idx + 1 : undefined
  }

  function handleAdded(item: PlanItem) {
    setItems((prev) => [...prev, item])
  }

  function handleUpdated(updated: PlanItem) {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
  }

  function handleRemoved(itemId: string) {
    setItems((prev) => prev.filter((i) => i.id !== itemId))
  }

  function handleReordered(newUntimed: PlanItem[]) {
    setItems((prev) => [...prev.filter((i) => i.start_time != null), ...newUntimed])
  }

  return (
    <section className="day-slot day-slot-planning" aria-label="Planning" data-slot="planning">
      <h2 className="day-slot-title">Plan</h2>
      <StaysSection
        stays={day.stays}
        selectedId={selectedId}
        pinNumberForId={pinNumberForId}
        onSelect={onSelect}
      />
      <TimedSection
        items={timed}
        tripId={tripId}
        day={day}
        tripDates={tripDates}
        selectedId={selectedId}
        pinNumberForId={pinNumberForId}
        onSelect={onSelect}
        onUpdated={handleUpdated}
        onRemoved={handleRemoved}
      />
      <UntimedSection
        items={untimed}
        timedItems={timed}
        tripId={tripId}
        day={day}
        tripDates={tripDates}
        selectedId={selectedId}
        pinNumberForId={pinNumberForId}
        onSelect={onSelect}
        onUpdated={handleUpdated}
        onRemoved={handleRemoved}
        onReordered={handleReordered}
      />
      {items.length === 0 && day.stays.length === 0 && (
        <p className="day-plan-empty">Nothing planned yet.</p>
      )}
      <QuickAddForm tripId={tripId} dayId={day.id} onAdded={handleAdded} />
      <BacklogLink tripId={tripId} />
    </section>
  )
}

// BudgetSlot renders the per-day budget editor, rollup display, and fast-add form.
function BudgetSlot({ tripId, day }: { tripId: string; day: Day }) {
  const [rollup, setRollup] = useState<BudgetRollup | null>(null)
  const [lines, setLines] = useState<BudgetLine[]>([])
  const [entries, setEntries] = useState<CostEntry[]>([])

  const loadRollup = useCallback(
    (signal?: AbortSignal) => {
      fetchBudgetRollup(tripId, signal)
        .then((r) => setRollup(r))
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return
        })
    },
    [tripId],
  )

  useEffect(() => {
    const controller = new AbortController()
    loadRollup(controller.signal)
    return () => controller.abort()
  }, [loadRollup, day.id])

  function handleLineUpdated(line: BudgetLine) {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.id === line.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = line
        return next
      }
      return [...prev, line]
    })
    loadRollup()
  }

  function handleEntryAdded(entry: CostEntry) {
    setEntries((prev) => [...prev, entry])
    loadRollup()
  }

  function handleEntryUpdated(entry: CostEntry) {
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? entry : e)))
    loadRollup()
  }

  function handleEntryDeleted(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id))
    loadRollup()
  }

  // Build lines list seeded with actual_amount from rollup for display
  const displayLines: BudgetLine[] = lines.map((l) => ({
    ...l,
    actual_amount: rollup?.by_day_category?.[day.id]?.[l.category] ?? l.actual_amount,
  }))

  return (
    <section className="day-slot day-slot-budget" aria-label="Budget" data-slot="budget">
      <h2 className="day-slot-title">Budget</h2>
      {rollup && <DayRollup rollup={rollup} dayId={day.id} />}
      <DayBudgetEditor
        tripId={tripId}
        dayId={day.id}
        lines={displayLines}
        onUpdated={handleLineUpdated}
      />
      <FastAddCost
        tripId={tripId}
        dayId={day.id}
        entries={entries}
        onAdded={handleEntryAdded}
        onUpdated={handleEntryUpdated}
        onDeleted={handleEntryDeleted}
      />
    </section>
  )
}

// JournalSlot renders the per-day journal editor (M06.4 S1).
// readOnly is true for past trips so the entry is shown as a permanent record.
function JournalSlot({
  tripId,
  dayId,
  readOnly,
}: {
  tripId: string
  dayId: string
  readOnly: boolean
}) {
  return (
    <section className="day-slot day-slot-journal" aria-label="Journal" data-slot="journal">
      <h2 className="day-slot-title">Journal</h2>
      <JournalEditor tripId={tripId} dayId={dayId} readOnly={readOnly} />
    </section>
  )
}

// MapSlot lazily renders the per-day map. When `day` is not yet loaded the
// placeholder shell is shown; once day data is available DayMap is loaded on
// demand (lazy + Suspense) so the map bundle is not fetched on initial load.
function MapSlot({
  day,
  selectedId,
  onSelect,
}: {
  day: Day | null
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  return (
    <section className="day-slot day-slot-map" aria-label="Map" data-slot="map">
      <h2 className="day-slot-title">Map</h2>
      {day ? (
        <Suspense
          fallback={
            <p className="day-map-loading" aria-busy="true">
              Loading map…
            </p>
          }
        >
          <DayMap key={day.id} day={day} selectedId={selectedId} onSelect={onSelect} />
        </Suspense>
      ) : (
        <p className="day-slot-placeholder">Map</p>
      )}
    </section>
  )
}

// FACETS are the four day sections. On phones they are shown one at a time and
// switched with a segmented control (a trip's facets aren't top-level nav
// destinations, so they live here rather than in the bottom bar). On laptop/
// tablet all four render together in the two-column grid.
const FACETS = [
  { key: 'plan', label: 'Plan' },
  { key: 'map', label: 'Map' },
  { key: 'budget', label: 'Budget' },
  { key: 'journal', label: 'Journal' },
] as const
type Facet = (typeof FACETS)[number]['key']

// FacetTabs is the mobile segmented control that switches the visible day facet.
function FacetTabs({ value, onChange }: { value: Facet; onChange: (f: Facet) => void }) {
  return (
    <div className="day-facet-tabs" role="tablist" aria-label="Trip sections">
      {FACETS.map((f) => (
        <button
          key={f.key}
          type="button"
          role="tab"
          aria-selected={value === f.key}
          className={['day-facet-tab', value === f.key ? 'day-facet-tab--active' : '']
            .filter(Boolean)
            .join(' ')}
          onClick={() => onChange(f.key)}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}

// DayView renders a single trip day identified by /trips/:tripId/days/:date.
// It fetches the day from the API, shows its metadata, and renders the planning
// section (stays, timed/untimed items, quick-add, backlog link) plus the Budget,
// Journal, and Map slots. On phones the four are shown one at a time via
// FacetTabs; on wider screens they render together in the two-column grid.
export function DayView() {
  const { tripId, date } = useParams<{ tripId: string; date: string }>()
  const { trip } = useTripShell()
  // A trip is "past" when its end date is before today; journals become read-only.
  const isPast = trip.end_date < new Date().toISOString().slice(0, 10)

  const mobile = useMobile()
  // On phones only one facet shows at a time; `view` tracks which. It lives in
  // component state (not the URL) so it persists as the user flips between days
  // — DayView stays mounted across date changes.
  const [view, setView] = useState<Facet>('plan')

  const [day, setDay] = useState<Day | null>(null)
  // planItems is the live source of truth for the day's plan items, lifted out of
  // PlanningSection so the map (MapSlot) reflects adds/edits/removes immediately
  // — without a page reload. Seeded from the fetched day and mutated in place.
  const [planItems, setPlanItems] = useState<PlanItem[]>([])
  // fetchError is scoped to a date so stale errors from a previous date are
  // not shown when the user navigates to a new day (avoids synchronous resets).
  const [fetchError, setFetchError] = useState<{ date: string; msg: string } | null>(null)
  // selectedId holds the currently highlighted entity id, shared between the
  // map pin legend and the planning list (Epic 04 S1).
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Derive loading: we are loading when neither a day result nor an error for
  // the current date param is available yet — no synchronous setState needed.
  const loading = day?.date !== date && fetchError?.date !== date
  const error = fetchError !== null && fetchError.date === date ? fetchError.msg : null

  useEffect(() => {
    if (!tripId || !date) return
    const controller = new AbortController()

    fetchDay(tripId, date, controller.signal)
      .then((d) => {
        setDay(d)
        setPlanItems(d.plan_items)
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (err instanceof UnauthorizedError) return
        setFetchError({ date, msg: 'Could not load day.' })
      })

    return () => controller.abort()
  }, [tripId, date])

  // liveDay overlays the live plan items onto the fetched day so the map and the
  // planning list share one source of truth — adding a stop updates both at once.
  const liveDay = day ? { ...day, plan_items: planItems } : null

  // day.index is 0-based (server-provided); +1 gives the 1-based display number.
  const dayNumber = day ? day.index + 1 : null

  return (
    <article className="day-view" aria-label={date ? `Day ${dayNumber ?? ''} — ${date}` : 'Day'}>
      <header className="day-view-header">
        <h2 className="day-view-title">{dayNumber !== null ? `Day ${dayNumber}` : 'Day'}</h2>
        {date && (
          <time className="day-view-date" dateTime={date}>
            {fullDate(date)}
          </time>
        )}
      </header>

      {loading && (
        <p className="day-view-loading" aria-busy="true">
          Loading day…
        </p>
      )}
      {error && (
        <p role="alert" className="day-view-error">
          {error}
        </p>
      )}
      {day?.notes && <p className="day-view-notes">{day.notes}</p>}

      {(() => {
        // The four day facets, built once and placed either together (grid) or
        // one at a time (mobile FacetTabs).
        const planningSlot =
          liveDay && tripId ? (
            <PlanningSection
              key={liveDay.id}
              day={liveDay}
              items={planItems}
              setItems={setPlanItems}
              tripId={tripId}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          ) : (
            <section
              className="day-slot day-slot-planning"
              aria-label="Planning"
              data-slot="planning"
            >
              <h2 className="day-slot-title">Plan</h2>
            </section>
          )
        const budgetSlot =
          day && tripId ? (
            <BudgetSlot tripId={tripId} day={day} />
          ) : (
            <section className="day-slot day-slot-budget" aria-label="Budget" data-slot="budget">
              <h2 className="day-slot-title">Budget</h2>
            </section>
          )
        const mapSlot = <MapSlot day={liveDay} selectedId={selectedId} onSelect={setSelectedId} />
        const journalSlot =
          day && tripId ? (
            <JournalSlot tripId={tripId} dayId={day.id} readOnly={isPast} />
          ) : (
            <section className="day-slot day-slot-journal" aria-label="Journal" data-slot="journal">
              <h2 className="day-slot-title">Journal</h2>
            </section>
          )

        // Phones: a segmented control switches a single full-width facet.
        if (mobile) {
          return (
            <div className="day-facets">
              <FacetTabs value={view} onChange={setView} />
              <div className="day-facet-panel">
                {view === 'plan' && planningSlot}
                {view === 'map' && mapSlot}
                {view === 'budget' && budgetSlot}
                {view === 'journal' && journalSlot}
              </div>
            </div>
          )
        }

        // Laptop/tablet: two-column layout (design reference §07) — living
        // itinerary + day budget on the left, map + journal on the right.
        return (
          <div className="day-grid">
            <div className="day-grid-col day-grid-left">
              {planningSlot}
              {budgetSlot}
            </div>
            <div className="day-grid-col day-grid-right">
              {mapSlot}
              {journalSlot}
            </div>
          </div>
        )
      })()}
    </article>
  )
}

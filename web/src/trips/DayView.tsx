import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useParams } from 'react-router-dom'
import { useFocusTrap } from '../components/ui/useFocusTrap'
import { Button, FormField, Input, Select } from '../components/ui'
import { collectLocatedItems } from './locatedItems'
import { StaySlot } from './StaySlot'
import { MAX_SPLIT_PARTS, splitAmount } from './splitAmount'
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
  type PlanItemKind,
  type Stay,
  type Suggestion,
} from '../lib/api'
import { fullDate } from '../lib/format'
import { enqueue } from '../lib/mutationQueue'
import { useIsOnline } from '../lib/useIsOnline'
import { readCache, writeCache } from '../lib/resourceCache'
import { cacheKeys } from '../lib/cacheKeys'
import { CacheStatus } from '../components/CacheStatus'
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
  // kind is carried through the form so edits/auto-saves round-trip it. The
  // backend defaults an omitted kind to 'activity', so NOT sending it would
  // silently downgrade a transport/food/note item on any edit. There is no
  // picker UI yet (that lands in M12.1 S5) — this is a hidden passthrough.
  kind: PlanItemKind
  type: string
  start_time: string
  duration: string
  location: string
  booking_status: string
  cost: string
  link: string
  // Transport columns, carried through as passthrough for the same round-trip
  // reason as kind — editing a transport item must not wipe them. The transport
  // input UI lands in M12.1 S5. (M12.1 S2)
  origin: string
  destination: string
  arrive_time: string
}

function emptyFields(): PlanItemFormFields {
  return {
    title: '',
    kind: 'activity',
    type: '',
    start_time: '',
    duration: '',
    location: '',
    booking_status: '',
    cost: '',
    link: '',
    origin: '',
    destination: '',
    arrive_time: '',
  }
}

// DETAILS_OPEN_KEY persists the "More details" disclosure so the extra fields
// stay open once a user has chosen to see them — no re-clicking on every add.
const DETAILS_OPEN_KEY = 'khiimori:planDetailsOpen'

// hasDetailValues reports whether any of the fields tucked behind "More details"
// are set. Title and Location live in the always-visible composer, so they're
// excluded. Used to auto-open the disclosure when editing an item that has them.
function hasDetailValues(f: PlanItemFormFields): boolean {
  return !!(
    f.type ||
    f.start_time ||
    f.duration ||
    f.booking_status ||
    f.cost ||
    f.link ||
    f.origin ||
    f.destination ||
    f.arrive_time
  )
}

// PLAN_ITEM_KINDS drives the kind picker — a behaviour, not a budget category.
// Each carries a short glyph so the picker reads at a glance. (M12.1 S5)
const PLAN_ITEM_KINDS: { value: PlanItemKind; label: string; glyph: string }[] = [
  { value: 'activity', label: 'Activity', glyph: '🎟' },
  { value: 'transport', label: 'Transport', glyph: '🚆' },
  { value: 'food', label: 'Food', glyph: '🍴' },
  { value: 'note', label: 'Note', glyph: '📝' },
]

// suggestedCategory maps a kind to its default budget category (the `type`
// field). Cost category is decoupled from kind: this is only the starting
// default, and the user can override it in the Category select. (M12.1 S5)
function suggestedCategory(kind: PlanItemKind): string {
  switch (kind) {
    case 'transport':
      return 'Transport'
    case 'food':
      return 'Food'
    case 'activity':
      return 'Activities'
    case 'note':
      return ''
  }
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
    kind: item.kind ?? 'activity',
    type: item.type ?? '',
    start_time: item.start_time ? item.start_time.slice(0, 5) : '',
    duration: item.duration ?? '',
    location: item.location ?? '',
    booking_status: item.booking_status ?? '',
    cost: item.cost != null ? String(item.cost) : '',
    link: item.link ?? '',
    origin: item.origin ?? '',
    destination: item.destination ?? '',
    arrive_time: item.arrive_time ? item.arrive_time.slice(0, 5) : '',
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
    kind: input.kind ?? 'activity',
    type: input.type ?? undefined,
    start_time: input.start_time ?? undefined,
    duration: input.duration ?? undefined,
    location: input.location ?? undefined,
    booking_status: input.booking_status ?? undefined,
    cost: input.cost ?? undefined,
    link: input.link ?? undefined,
    origin: input.origin ?? undefined,
    destination: input.destination ?? undefined,
    arrive_time: input.arrive_time ?? undefined,
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
    kind: fields.kind,
    type: fields.type.trim() || null,
    start_time: fields.start_time.trim() || null,
    duration: fields.duration.trim() || null,
    location: fields.location.trim() || null,
    booking_status: fields.booking_status.trim() || null,
    cost: fields.cost.trim() ? parseFloat(fields.cost) : null,
    link: fields.link.trim() || null,
    origin: fields.origin.trim() || null,
    destination: fields.destination.trim() || null,
    arrive_time: fields.arrive_time.trim() || null,
  }
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
  // splitParts drives the split-cost helper (add mode only). 1 = no split.
  const [splitParts, setSplitParts] = useState(1)
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
          <FormField label="From" htmlFor={`${fid}-origin`}>
            <Input
              id={`${fid}-origin`}
              type="text"
              value={fields.origin}
              onChange={(e) => set('origin', e.target.value)}
              placeholder="Lisbon"
              disabled={submitting}
            />
          </FormField>
          <FormField label="To" htmlFor={`${fid}-dest`}>
            <Input
              id={`${fid}-dest`}
              type="text"
              value={fields.destination}
              onChange={(e) => set('destination', e.target.value)}
              placeholder="Porto"
              disabled={submitting}
            />
          </FormField>
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
                        onChange={(e) => setSplitParts(e.target.checked ? 2 : 1)}
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
                          value={String(splitParts)}
                          onChange={(e) => {
                            const n = Math.round(Number(e.target.value))
                            setSplitParts(
                              Number.isFinite(n) ? Math.min(MAX_SPLIT_PARTS, Math.max(2, n)) : 2,
                            )
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
  onAdded,
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
  // onAdded appends a newly created sibling item (used when a split turns one
  // item into several parts on save).
  onAdded: (item: PlanItem) => void
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

  async function handleSave(fields: PlanItemFormFields, splitParts: number) {
    setEditError(null)
    const base = fieldsToInput(fields, item.day_id)
    try {
      if (splitParts > 1 && base.cost != null && base.cost > 0) {
        // Split an existing item: divide the cost to the cent and reshape it
        // into N parts. Part 1 reuses this item (keeping its id, day, status and
        // order); the remaining parts become new sibling items on the same day.
        const shares = splitAmount(base.cost, splitParts)
        const first = await updatePlanItem(tripId, item.id, {
          ...base,
          title: `${base.title} (part 1/${splitParts})`,
          cost: shares[0],
        })
        onUpdated(first)
        for (let i = 1; i < splitParts; i++) {
          const created = await createPlanItem(tripId, {
            ...base,
            title: `${base.title} (part ${i + 1}/${splitParts})`,
            cost: shares[i],
          })
          onAdded(created)
        }
        setEditing(false)
        return
      }
      const updated = await updatePlanItem(tripId, item.id, base)
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
  onAdded,
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
  onAdded: (item: PlanItem) => void
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
            onAdded={onAdded}
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
  onAdded,
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
  onAdded: (item: PlanItem) => void
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
            onAdded={onAdded}
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
export function PlanningSection({
  day,
  items,
  setItems,
  setStays,
  tripId,
  selectedId = null,
  onSelect,
  title = 'Plan',
  showBacklogLink = true,
}: {
  day: Day
  // items / setItems are owned by the parent so a sibling view (the day map, or
  // the trip-scoped Plan subtab's rail) stays in sync with edits.
  items: PlanItem[]
  setItems: React.Dispatch<React.SetStateAction<PlanItem[]>>
  // setStays updates this day's stays in the parent so the pinned stay slot and
  // the day map stay in sync after an add/edit/remove.
  setStays: React.Dispatch<React.SetStateAction<Stay[]>>
  tripId: string
  // selectedId / onSelect drive the map-pin badges (day view). Omit them in
  // map-less contexts (the Plan subtab) and no pin badges render.
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  // title overrides the section heading (default "Plan"); the Plan subtab uses
  // the day's name so each stacked day is labelled.
  title?: string
  // showBacklogLink renders the in-section backlog link (day view). The Plan
  // subtab surfaces the backlog once in its rail instead, so it opts out.
  showBacklogLink?: boolean
}) {
  const { trip } = useTripShell()
  const tripDates = datesInRange(trip.start_date, trip.end_date)

  const timed = items.filter((item) => item.start_time != null)
  const untimed = items.filter((item) => item.start_time == null)

  // Build a lookup from item/stay id → pin number (1-based) using the same
  // ordering as collectLocatedItems so badges match the map legend. Only needed
  // when a map is present (onSelect wired) — otherwise no badges are shown.
  const locatedItems = collectLocatedItems({ ...day, plan_items: items })
  const pinNumberForId = onSelect
    ? (id: string): number | undefined => {
        const idx = locatedItems.findIndex((li) => li.id === id)
        return idx >= 0 ? idx + 1 : undefined
      }
    : undefined

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
      <h2 className="day-slot-title">{title}</h2>
      <StaySlot
        day={day}
        tripId={tripId}
        setStays={setStays}
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
        onAdded={handleAdded}
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
        onAdded={handleAdded}
        onRemoved={handleRemoved}
        onReordered={handleReordered}
      />
      {items.length === 0 && day.stays.length === 0 && (
        <p className="day-plan-empty">Nothing planned yet.</p>
      )}
      <QuickAddForm tripId={tripId} dayId={day.id} onAdded={handleAdded} />
      {showBacklogLink && <BacklogLink tripId={tripId} />}
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
        .then((r) => {
          setRollup(r)
          void writeCache(cacheKeys.budgetRollup(tripId), r)
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return
        })
    },
    [tripId],
  )

  useEffect(() => {
    const controller = new AbortController()
    let done = false
    // Instant-render: seed the roll-up from cache, then refresh. Sequencing the
    // fetch after the cache read means a slow fresh response can't be overwritten
    // by a late-arriving cached value.
    void readCache<BudgetRollup>(cacheKeys.budgetRollup(tripId)).then((cached) => {
      if (done) return
      if (cached) setRollup(cached.data)
      loadRollup(controller.signal)
    })
    return () => {
      done = true
      controller.abort()
    }
  }, [loadRollup, day.id, tripId])

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

  // Instant-render cache state (M11.1 S2): seededFromCache is true while the day
  // shown came from the on-device cache; revalidating is true while the
  // background fetch runs. Together they drive the subtle "Updating…" hint.
  const [seededFromCache, setSeededFromCache] = useState(false)
  const [revalidating, setRevalidating] = useState(false)

  // Derive loading: we are loading when neither a day result nor an error for
  // the current date param is available yet — no synchronous setState needed.
  const loading = day?.date !== date && fetchError?.date !== date
  const error = fetchError !== null && fetchError.date === date ? fetchError.msg : null

  useEffect(() => {
    if (!tripId || !date) return
    const controller = new AbortController()
    let done = false
    const key = cacheKeys.day(tripId, date)

    // Instant-render: paint the last-known day from cache first (so a backend
    // cold start / weak connection doesn't show a spinner), then revalidate and
    // swap in fresh data. A failed refresh is non-destructive — the cached day
    // stays on screen and no error is shown.
    void readCache<Day>(key).then((cached) => {
      if (done) return
      const hasCache = cached !== null && cached.data.date === date
      if (hasCache) {
        setDay(cached.data)
        setPlanItems(cached.data.plan_items)
        setSeededFromCache(true)
      }
      setRevalidating(true)
      return fetchDay(tripId, date, controller.signal).then(
        (d) => {
          if (done) return
          setDay(d)
          setPlanItems(d.plan_items)
          setSeededFromCache(false)
          setRevalidating(false)
          void writeCache(key, d)
        },
        (err: unknown) => {
          if (done) return
          setRevalidating(false)
          if (err instanceof DOMException && err.name === 'AbortError') return
          if (err instanceof UnauthorizedError) return
          if (!hasCache) setFetchError({ date, msg: 'Could not load day.' })
        },
      )
    })

    return () => {
      done = true
      controller.abort()
    }
  }, [tripId, date])

  // liveDay overlays the live plan items onto the fetched day so the map and the
  // planning list share one source of truth — adding a stop updates both at once.
  const liveDay = day ? { ...day, plan_items: planItems } : null

  // setStays updates the fetched day's stays in place so the pinned stay slot
  // and the day map reflect an add/edit/remove without a reload.
  const setStays: React.Dispatch<React.SetStateAction<Stay[]>> = (action) => {
    setDay((cur) =>
      cur
        ? {
            ...cur,
            stays:
              typeof action === 'function'
                ? (action as (prev: Stay[]) => Stay[])(cur.stays)
                : action,
          }
        : cur,
    )
  }

  // day.index is 0-based (server-provided); +1 gives the 1-based display number.
  const dayNumber = day ? day.index + 1 : null

  return (
    <article className="day-view" aria-label={date ? `Day ${dayNumber ?? ''} — ${date}` : 'Day'}>
      <header className="day-view-header">
        <h2 className="day-view-title">
          {dayNumber !== null ? `Day ${dayNumber}` : 'Day'}
          <CacheStatus fromCache={seededFromCache} isValidating={revalidating} />
        </h2>
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
              setStays={setStays}
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

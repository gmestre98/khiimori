import { useState, type FormEvent } from 'react'
import {
  createStay,
  deleteStay,
  updateStay,
  StayOverlapError,
  StayValidationError,
  type Day,
  type Stay,
  type StayInput,
} from '../lib/api'
import { enqueue } from '../lib/mutationQueue'
import { useIsOnline } from '../lib/useIsOnline'
import { Button, FormField, Input } from '../components/ui'
import { LocationField } from './LocationField'
import { coversDay } from './stayCoverage'

// StaySlot is the pinned "where you're staying" panel at the top of a day's
// plan (M12.1 S4). A stay is where you sleep, so it sits above the timeline and
// there is exactly one per night: a day carries at most one covering stay (the
// backend rejects overlaps, S3), so this slot shows that stay — editable inline
// — or an add affordance when the night is free.

// parseYMD reads a YYYY-MM-DD date as a UTC timestamp so day arithmetic is
// DST-proof.
function parseYMD(s: string): number {
  return Date.parse(`${s}T00:00:00Z`)
}

// daysBetween returns whole days from a to b (both YYYY-MM-DD).
function daysBetween(a: string, b: string): number {
  return Math.round((parseYMD(b) - parseYMD(a)) / 86_400_000)
}

// NightContext describes where `date` falls within a stay's span.
interface NightContext {
  night: number
  total: number
  isCheckIn: boolean
}

// nightContext computes "night N of M" for the given day within a dated stay,
// or null when the stay has no complete date range covering the day.
function nightContext(stay: Stay, date: string): NightContext | null {
  if (!stay.check_in || !stay.check_out) return null
  const total = daysBetween(stay.check_in, stay.check_out)
  if (total <= 0) return null
  const night = daysBetween(stay.check_in, date) + 1
  if (night < 1 || night > total) return null
  return { night, total, isCheckIn: date === stay.check_in }
}

// StayFormFields holds the raw string values of the stay form (controlled
// inputs); numeric/date fields are parsed on submit.
interface StayFormFields {
  name: string
  location: string
  check_in: string
  check_out: string
  cost: string
  link: string
  paid: boolean
}

function emptyStayFields(date: string): StayFormFields {
  // Default check-in to this day and check-out to the next — the common case is
  // adding the place you sleep tonight.
  const nextDay = new Date(parseYMD(date) + 86_400_000).toISOString().slice(0, 10)
  return {
    name: '',
    location: '',
    check_in: date,
    check_out: nextDay,
    cost: '',
    link: '',
    paid: false,
  }
}

function fieldsFromStay(stay: Stay): StayFormFields {
  return {
    name: stay.name,
    location: stay.location ?? '',
    check_in: stay.check_in ?? '',
    check_out: stay.check_out ?? '',
    cost: stay.cost != null ? String(stay.cost) : '',
    link: stay.link ?? '',
    paid: stay.paid ?? false,
  }
}

function fieldsToStayInput(fields: StayFormFields): StayInput {
  return {
    name: fields.name.trim(),
    location: fields.location.trim() || null,
    check_in: fields.check_in.trim() || null,
    check_out: fields.check_out.trim() || null,
    cost: fields.cost.trim() ? parseFloat(fields.cost) : null,
    link: fields.link.trim() || null,
    paid: fields.paid,
  }
}

// tempStay synthesises a client-side stay for an offline add/edit so the slot
// reflects it immediately; the authoritative row lands when the queue replays.
function tempStay(tripId: string, input: StayInput): Stay {
  return {
    id: input.id ?? crypto.randomUUID(),
    trip_id: tripId,
    name: input.name,
    location: input.location ?? undefined,
    check_in: input.check_in ?? undefined,
    check_out: input.check_out ?? undefined,
    cost: input.cost ?? undefined,
    link: input.link ?? undefined,
    paid: input.paid ?? false,
  }
}

export function StaySlot({
  day,
  tripId,
  setStays,
  onStaySaved,
  onStayRemoved,
  selectedId = null,
  pinNumberForId,
  onSelect,
}: {
  day: Day
  tripId: string
  // setStays updates this day's stays in the parent's day state so the slot and
  // any sibling view (the day map) stay in sync without a reload.
  setStays: React.Dispatch<React.SetStateAction<Stay[]>>
  // onStaySaved / onStayRemoved let a parent that holds several days at once (the
  // whole-trip Plan view) reflect a saved/removed stay across *every* night it
  // covers — so a two-night stay appears on both days without a reload. When
  // omitted (the single-day DayView), StaySlot falls back to updating just this
  // day via setStays.
  onStaySaved?: (saved: Stay) => void
  onStayRemoved?: (stayId: string) => void
  selectedId?: string | null
  pinNumberForId?: (id: string) => number | undefined
  onSelect?: (id: string | null) => void
}) {
  const online = useIsOnline()
  const stay = day.stays[0] ?? null

  // mode: 'view' shows the stay (or add button); 'add'/'edit' show the form.
  const [mode, setMode] = useState<'view' | 'add' | 'edit'>('view')
  const [fields, setFields] = useState<StayFormFields>(emptyStayFields(day.date))
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function openAdd() {
    setFields(emptyStayFields(day.date))
    setError(null)
    setMode('add')
  }

  function openEdit() {
    if (!stay) return
    setFields(fieldsFromStay(stay))
    setError(null)
    setMode('edit')
  }

  function set(key: keyof StayFormFields, value: string) {
    setFields((f) => ({ ...f, [key]: value }))
  }

  // reflect places the saved stay into the day view. When a multi-day parent is
  // wired (onStaySaved), it spreads the stay across every night it now covers;
  // otherwise it just updates this day, dropping the stay when its new dates no
  // longer cover this day (e.g. an edit pushed it to other nights).
  function reflect(saved: Stay) {
    if (onStaySaved) {
      onStaySaved(saved)
      return
    }
    setStays(coversDay(saved, day.date) ? [saved] : [])
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!fields.name.trim()) {
      setError('Give the stay a name.')
      return
    }
    setSubmitting(true)
    setError(null)
    const input = fieldsToStayInput(fields)
    try {
      if (mode === 'edit' && stay) {
        if (online) {
          reflect(await updateStay(tripId, stay.id, input))
        } else {
          await enqueue('updateStay', { tripId, stayId: stay.id, input })
          reflect(tempStay(tripId, { ...input, id: stay.id }))
        }
      } else {
        // Add: attach a stable client id so an offline replay upserts idempotently.
        const withId: StayInput = { ...input, id: crypto.randomUUID() }
        if (online) {
          reflect(await createStay(tripId, withId))
        } else {
          await enqueue('createStay', { tripId, input: withId })
          reflect(tempStay(tripId, withId))
        }
      }
      setMode('view')
    } catch (err) {
      if (err instanceof StayOverlapError) {
        setError('Another stay already covers those nights.')
      } else if (err instanceof StayValidationError) {
        setError(err.message)
      } else {
        setError('Could not save the stay.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  // setPaid writes the stay's paid flag in place (a full-replacement edit
  // reusing the stay's current fields) so the traveller can change a booking's
  // state straight from the card's dropdown without opening the form.
  async function setPaid(paid: boolean) {
    if (!stay || paid === (stay.paid ?? false)) return
    setSubmitting(true)
    setError(null)
    const input: StayInput = { ...fieldsToStayInput(fieldsFromStay(stay)), paid }
    try {
      if (online) {
        reflect(await updateStay(tripId, stay.id, input))
      } else {
        await enqueue('updateStay', { tripId, stayId: stay.id, input })
        reflect(tempStay(tripId, { ...input, id: stay.id }))
      }
    } catch {
      setError('Could not update the stay.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRemove() {
    if (!stay) return
    setSubmitting(true)
    setError(null)
    try {
      if (online) {
        await deleteStay(tripId, stay.id)
      } else {
        await enqueue('deleteStay', { tripId, stayId: stay.id })
      }
      if (onStayRemoved) onStayRemoved(stay.id)
      else setStays([])
      setMode('view')
    } catch {
      setError('Could not remove the stay.')
    } finally {
      setSubmitting(false)
    }
  }

  if (mode === 'add' || mode === 'edit') {
    return (
      <section className="day-stays-section" aria-label="Accommodation">
        <h3 className="day-stays-section-title">Staying</h3>
        <form className="stay-form" onSubmit={handleSubmit} aria-label="Stay details">
          <FormField label="Name" htmlFor="stay-name">
            <Input
              id="stay-name"
              value={fields.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Grand Hotel"
              disabled={submitting}
              autoFocus
            />
          </FormField>
          <LocationField
            value={fields.location}
            onChange={(v) => set('location', v)}
            disabled={submitting}
            placeholder="Ribeira, Porto"
          />
          <div className="stay-form-grid">
            <FormField label="Check in" htmlFor="stay-check-in">
              <Input
                id="stay-check-in"
                type="date"
                value={fields.check_in}
                onChange={(e) => set('check_in', e.target.value)}
                disabled={submitting}
              />
            </FormField>
            <FormField label="Check out" htmlFor="stay-check-out">
              <Input
                id="stay-check-out"
                type="date"
                value={fields.check_out}
                onChange={(e) => set('check_out', e.target.value)}
                disabled={submitting}
              />
            </FormField>
          </div>
          <div className="stay-form-grid">
            <FormField label="Cost (€)" htmlFor="stay-cost">
              <Input
                id="stay-cost"
                type="number"
                inputMode="decimal"
                value={fields.cost}
                onChange={(e) => set('cost', e.target.value)}
                placeholder="0.00"
                disabled={submitting}
              />
            </FormField>
            <FormField label="Link" htmlFor="stay-link">
              <Input
                id="stay-link"
                type="url"
                value={fields.link}
                onChange={(e) => set('link', e.target.value)}
                placeholder="https://…"
                disabled={submitting}
              />
            </FormField>
          </div>
          <label className="stay-paid-check">
            <input
              type="checkbox"
              checked={fields.paid}
              onChange={(e) => setFields((f) => ({ ...f, paid: e.target.checked }))}
              disabled={submitting}
            />
            <span>Paid — count this toward spent (otherwise it&rsquo;s an upcoming estimate)</span>
          </label>
          {error && (
            <p role="alert" className="stay-form-error">
              {error}
            </p>
          )}
          <div className="stay-form-actions">
            <Button type="submit" disabled={submitting}>
              {mode === 'edit' ? 'Save stay' : 'Add stay'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setMode('view')
                setError(null)
              }}
              disabled={submitting}
            >
              Cancel
            </Button>
          </div>
        </form>
      </section>
    )
  }

  return (
    <section className="day-stays-section" aria-label="Accommodation">
      <h3 className="day-stays-section-title">Staying</h3>
      {stay ? (
        <StayCard
          stay={stay}
          date={day.date}
          selected={selectedId === stay.id}
          pinNumber={pinNumberForId?.(stay.id)}
          onSelect={onSelect}
          onEdit={openEdit}
          onRemove={handleRemove}
          onSetPaid={setPaid}
          removing={submitting}
        />
      ) : (
        <button type="button" className="stay-add-btn" onClick={openAdd}>
          + Add where you're staying
        </button>
      )}
      {error && !stay && (
        <p role="alert" className="stay-form-error">
          {error}
        </p>
      )}
    </section>
  )
}

// StayCard shows the current stay with its per-night context and edit/remove
// affordances. Keeps the map-pin badge behaviour from the old read-only section.
function StayCard({
  stay,
  date,
  selected,
  pinNumber,
  onSelect,
  onEdit,
  onRemove,
  onSetPaid,
  removing,
}: {
  stay: Stay
  date: string
  selected: boolean
  pinNumber?: number
  onSelect?: (id: string | null) => void
  onEdit: () => void
  onRemove: () => void
  onSetPaid: (paid: boolean) => void
  removing: boolean
}) {
  const ctx = nightContext(stay, date)
  // A paid badge only makes sense when there's a cost to count.
  const hasCost = stay.cost != null && stay.cost > 0
  return (
    <div className={['stay-item', selected ? 'stay-item--selected' : ''].filter(Boolean).join(' ')}>
      <div className="stay-item-main">
        {pinNumber != null && onSelect && (
          <button
            type="button"
            className={['plan-item-pin-badge', selected ? 'plan-item-pin-badge--selected' : '']
              .filter(Boolean)
              .join(' ')}
            aria-label={`Map pin ${pinNumber} for ${stay.name}`}
            aria-pressed={selected}
            onClick={() => onSelect(selected ? null : stay.id)}
          >
            {pinNumber}
          </button>
        )}
        {/* The card body is the edit trigger — tap anywhere on it to open the
            form, mirroring how a plan-item row opens its editor (no separate
            "Edit" button to hunt for on a phone). */}
        <button
          type="button"
          className="stay-edit-btn"
          aria-label={`Edit ${stay.name}`}
          onClick={onEdit}
        >
          <span className="stay-edit-head">
            <span className="stay-name">{stay.name}</span>
            {ctx && (
              <span className="stay-night-badge">
                {ctx.isCheckIn ? 'checking in' : `night ${ctx.night} of ${ctx.total}`}
              </span>
            )}
          </span>
          {stay.location && <span className="stay-location">{stay.location}</span>}
          {stay.check_in && stay.check_out && (
            <span
              className="stay-dates"
              aria-label={`Check in ${stay.check_in}, check out ${stay.check_out}`}
            >
              {stay.check_in} – {stay.check_out}
            </span>
          )}
          {hasCost && (
            <span
              className={`stay-paid-badge${stay.paid ? ' stay-paid-badge--paid' : ''}`}
              aria-label={stay.paid ? 'Paid — counts toward spent' : 'Not paid — upcoming estimate'}
            >
              {stay.paid ? 'Paid' : 'Upcoming'}
            </span>
          )}
        </button>
      </div>
      <div className="stay-item-actions">
        {hasCost && (
          <select
            className="stay-status-select"
            value={stay.paid ? 'paid' : 'upcoming'}
            onChange={(e) => onSetPaid(e.target.value === 'paid')}
            disabled={removing}
            aria-label={`Payment: ${stay.paid ? 'Paid' : 'Upcoming'}`}
          >
            <option value="upcoming">Upcoming</option>
            <option value="paid">Paid</option>
          </select>
        )}
        <button
          type="button"
          className="stay-action stay-action--danger"
          onClick={onRemove}
          disabled={removing}
        >
          Remove
        </button>
      </div>
    </div>
  )
}

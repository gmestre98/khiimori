import { useState, type FormEvent } from 'react'
import {
  TripValidationError,
  TripShrinkConflictError,
  createTrip,
  updateTrip,
  UnauthorizedError,
  type Trip,
  type TripInput,
} from '../lib/api'

export interface TripFormProps {
  /** Provide an existing trip to switch the form into edit mode. */
  trip?: Trip
  onSuccess: (trip: Trip) => void
  onCancel: () => void
}

// parseDests splits a comma-separated destinations string into a trimmed array,
// filtering out blank entries.
function parseDests(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

// dateRangeEffect describes the days impact when editing an existing trip's dates.
type DateRangeEffect = 'none' | 'expand' | 'shrink'

function computeRangeEffect(
  original: Trip | undefined,
  newStart: string,
  newEnd: string,
): DateRangeEffect {
  if (!original || !newStart || !newEnd) return 'none'
  const origDays =
    Math.round(
      (new Date(original.end_date).getTime() - new Date(original.start_date).getTime()) /
        86_400_000,
    ) + 1
  const newDays =
    Math.round((new Date(newEnd).getTime() - new Date(newStart).getTime()) / 86_400_000) + 1
  if (newDays > origDays) return 'expand'
  if (newDays < origDays) return 'shrink'
  return 'none'
}

// TripForm handles both create and edit. In create mode (no `trip` prop) it
// posts to POST /trips; in edit mode it patches via PATCH /trips/:id.
// When shrinking a trip that has data, a 409 is surfaced as a confirmation
// step — the user must explicitly confirm before force_shrink is sent.
export function TripForm({ trip, onSuccess, onCancel }: TripFormProps) {
  const isEdit = trip !== undefined

  const [name, setName] = useState(trip?.name ?? '')
  const [destinations, setDestinations] = useState(trip?.destinations.join(', ') ?? '')
  const [startDate, setStartDate] = useState(trip?.start_date ?? '')
  const [endDate, setEndDate] = useState(trip?.end_date ?? '')
  const [cover, setCover] = useState(trip?.cover ?? '')

  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // shrinkConflict is set when the server returns 409 days_have_data.
  const [shrinkConflict, setShrinkConflict] = useState<{ count: number } | null>(null)

  const rangeEffect = computeRangeEffect(trip, startDate, endDate)

  // Client-side validation — returns an error string or null.
  function validate(): string | null {
    if (!name.trim()) return 'Name is required.'
    if (!startDate) return 'Start date is required.'
    if (!endDate) return 'End date is required.'
    if (endDate < startDate) return 'End date must be on or after start date.'
    return null
  }

  async function submit(forceShrink = false) {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setSubmitting(true)

    const input: TripInput = {
      name: name.trim(),
      destinations: parseDests(destinations),
      start_date: startDate,
      end_date: endDate,
      cover: cover.trim(),
    }

    try {
      const result = isEdit
        ? await updateTrip(trip.id, input, forceShrink)
        : await createTrip(input)
      onSuccess(result)
    } catch (err) {
      if (err instanceof TripShrinkConflictError) {
        setShrinkConflict({ count: err.count })
      } else if (err instanceof TripValidationError) {
        setError(err.message)
      } else if (err instanceof UnauthorizedError) {
        // Central handler drives re-auth; nothing more to do here.
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    void submit(false)
  }

  function handleConfirmShrink() {
    setShrinkConflict(null)
    void submit(true)
  }

  function handleCancelShrink() {
    setShrinkConflict(null)
  }

  // Shrink confirmation dialog — shown when 409 days_have_data is returned.
  if (shrinkConflict) {
    return (
      <div className="trip-form-shrink-confirm" role="alertdialog" aria-modal="true">
        <p className="trip-form-shrink-warning">
          Shortening this trip will remove {shrinkConflict.count} day
          {shrinkConflict.count !== 1 ? 's' : ''} that already hold data. This cannot be undone.
        </p>
        <div className="trip-form-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={handleConfirmShrink}
            disabled={submitting}
          >
            Yes, remove days
          </button>
          <button type="button" className="btn-secondary" onClick={handleCancelShrink}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <form className="trip-form" onSubmit={handleSubmit} noValidate>
      <label className="trip-form-field">
        <span>Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Japan 2025"
          required
          aria-required="true"
        />
      </label>

      <label className="trip-form-field">
        <span>Destinations</span>
        <input
          type="text"
          value={destinations}
          onChange={(e) => setDestinations(e.target.value)}
          placeholder="e.g. Tokyo, Kyoto"
        />
        <span className="trip-form-hint">Comma-separated list</span>
      </label>

      <label className="trip-form-field">
        <span>Start date</span>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          required
          aria-required="true"
        />
      </label>

      <label className="trip-form-field">
        <span>End date</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          required
          aria-required="true"
        />
      </label>

      {isEdit && rangeEffect === 'expand' && (
        <p className="trip-form-range-info" role="status">
          Extending this trip will add new days.
        </p>
      )}

      {isEdit && rangeEffect === 'shrink' && (
        <p className="trip-form-range-warn" role="status">
          Shortening this trip will remove days. Any data on removed days will be lost.
        </p>
      )}

      <label className="trip-form-field">
        <span>Cover image URL</span>
        <input
          type="url"
          value={cover}
          onChange={(e) => setCover(e.target.value)}
          placeholder="https://…"
        />
      </label>

      <label className="trip-form-field">
        <span>Currency</span>
        <input type="text" value="EUR" readOnly className="trip-form-readonly" />
      </label>

      {error && (
        <p role="alert" className="trip-form-error">
          {error}
        </p>
      )}

      <div className="trip-form-actions">
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create trip'}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </form>
  )
}

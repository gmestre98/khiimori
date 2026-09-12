import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  TripValidationError,
  TripShrinkConflictError,
  createTrip,
  updateTrip,
  uploadTripCover,
  deleteTripCover,
  UnauthorizedError,
  type Trip,
  type TripInput,
} from '../lib/api'
import { shortDate } from '../lib/format'
import { CONTINENTS } from '../lib/continents'
import { HeroScene } from './heroScene'

// Cover upload constraints, mirrored client-side for instant feedback (the server
// enforces the same limits authoritatively).
const MAX_COVER_BYTES = 10 * 1024 * 1024 // 10 MB
const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

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

// nightsBetween returns the number of nights between two YYYY-MM-DD dates, or
// null if the range is incomplete or inverted.
function nightsBetween(start: string, end: string): number | null {
  if (!start || !end || end < start) return null
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000)
}

// TripFormHero is the Direction B banner atop the form: it echoes the day/trip
// heroes so creating or editing a trip lives inside the same warm system rather
// than on a bare form. It reflects the fields live as the user types — the scene,
// title and chips update with the name, destinations, dates and cover.
function TripFormHero({
  isEdit,
  name,
  destinations,
  startDate,
  endDate,
  cover,
}: {
  isEdit: boolean
  name: string
  destinations: string[]
  startDate: string
  endDate: string
  cover: string
}) {
  const seed = destinations[0] || name.trim() || 'trip'
  const nights = nightsBetween(startDate, endDate)
  const dateLabel = nights !== null ? `${shortDate(startDate)} – ${shortDate(endDate)}` : null
  const trimmedName = name.trim()
  return (
    <header className="trip-form-hero">
      <HeroScene seed={seed} image={cover.trim()} className="trip-form-hero-scene" />
      <div className="trip-form-hero-grad" aria-hidden="true" />
      <div className="trip-form-hero-body">
        <p className="trip-form-hero-eyebrow">{isEdit ? 'Editing trip' : 'New trip'}</p>
        <h1 className="trip-form-hero-title">
          {trimmedName || <span className="trip-form-hero-placeholder">Untitled trip</span>}
        </h1>
        <div className="trip-form-hero-sub">
          {dateLabel && (
            <span className="chip glass">
              {dateLabel}
              {nights ? ` · ${nights} ${nights === 1 ? 'night' : 'nights'}` : ''}
            </span>
          )}
          {destinations.length > 0 && (
            <span className="trip-form-hero-dest">{destinations.join(' · ')}</span>
          )}
        </div>
      </div>
    </header>
  )
}

// TripForm handles both create and edit. In create mode (no `trip` prop) it
// posts to POST /trips; in edit mode it patches via PATCH /trips/:id.
// When shrinking a trip that has data, a 409 is surfaced as a confirmation
// step — the user must explicitly confirm before force_shrink is sent.
export function TripForm({ trip, onSuccess, onCancel }: TripFormProps) {
  const isEdit = trip !== undefined

  const [name, setName] = useState(trip?.name ?? '')
  const [destinations, setDestinations] = useState(trip?.destinations.join(', ') ?? '')
  const [continent, setContinent] = useState(trip?.continent ?? '')
  const [startDate, setStartDate] = useState(trip?.start_date ?? '')
  const [endDate, setEndDate] = useState(trip?.end_date ?? '')

  // Cover is upload-managed, not a URL field. We keep the stored reference
  // (`coverRef`) to round-trip on edit (never editable here), plus the picked
  // File pending upload, an object-URL preview of it, and the existing display
  // URL — so the hero shows the right image before anything is saved.
  const coverRef = trip?.cover ?? ''
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverObjectUrl, setCoverObjectUrl] = useState<string | null>(null)
  const existingCoverUrl = trip?.cover_url ?? ''
  const [coverRemoved, setCoverRemoved] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // shrinkConflict is set when the server returns 409 days_have_data.
  const [shrinkConflict, setShrinkConflict] = useState<{ count: number } | null>(null)

  // savedTrip guards against re-creating on a retry: once the trip is created or
  // updated, a subsequent submit (e.g. after a cover upload failed) reuses it and
  // only re-attempts the cover step.
  const [savedTrip, setSavedTrip] = useState<Trip | null>(null)

  // Revoke the object URL when it changes or on unmount to avoid leaking blobs.
  useEffect(() => {
    return () => {
      if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl)
    }
  }, [coverObjectUrl])

  const rangeEffect = computeRangeEffect(trip, startDate, endDate)
  const destList = parseDests(destinations)

  // What the hero (and the picker preview) should show: a freshly picked file
  // wins; otherwise the existing cover unless the user removed it.
  const coverPreview = coverObjectUrl ?? (coverRemoved ? '' : existingCoverUrl)

  // The hero is shared by both the form and the shrink-confirmation step so the
  // screen keeps its identity across states.
  const hero = (
    <TripFormHero
      isEdit={isEdit}
      name={name}
      destinations={destList}
      startDate={startDate}
      endDate={endDate}
      cover={coverPreview}
    />
  )

  // pickCover validates and stages a chosen file, generating a local preview.
  function pickCover(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Allow re-selecting the same file later by clearing the input value.
    e.target.value = ''
    if (!file) return
    if (!COVER_TYPES.includes(file.type)) {
      setError('Choose a JPG, PNG, WebP or GIF image.')
      return
    }
    if (file.size > MAX_COVER_BYTES) {
      setError('That image is too large (max 10 MB).')
      return
    }
    setError(null)
    if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl)
    setCoverObjectUrl(URL.createObjectURL(file))
    setCoverFile(file)
    setCoverRemoved(false)
  }

  // removeCover clears both a pending pick and any existing cover.
  function removeCover() {
    if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl)
    setCoverObjectUrl(null)
    setCoverFile(null)
    setCoverRemoved(true)
  }

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

    // coverRef round-trips the stored reference unchanged so an edit never wipes
    // an existing cover (the cover is managed only via the upload/delete calls
    // below, never through the trip's cover field).
    const input: TripInput = {
      name: name.trim(),
      destinations: parseDests(destinations),
      start_date: startDate,
      end_date: endDate,
      cover: coverRef,
      continent,
    }

    // Save the trip first (unless a prior attempt already did — retry only the
    // cover step then, so we never create a duplicate).
    let result = savedTrip
    if (!result) {
      try {
        result = isEdit ? await updateTrip(trip.id, input, forceShrink) : await createTrip(input)
        setSavedTrip(result)
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          setSubmitting(false)
          return
        }
        if (err instanceof TripShrinkConflictError) {
          setShrinkConflict({ count: err.count })
        } else if (err instanceof TripValidationError) {
          setError(err.message)
        } else {
          setError('Something went wrong. Please try again.')
        }
        setSubmitting(false)
        return
      }
    }

    // Apply the cover to the now-saved trip. A failure here leaves the trip saved
    // (savedTrip retained) but keeps the form open so the user can retry or cancel.
    try {
      if (coverFile) {
        result = await uploadTripCover(result.id, coverFile)
      } else if (coverRemoved && coverRef) {
        result = await deleteTripCover(result.id)
      }
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        setSubmitting(false)
        return
      }
      setError(
        err instanceof TripValidationError
          ? `Trip saved, but the cover didn’t upload: ${err.message}`
          : 'Trip saved, but the cover image didn’t upload. Try again or choose another image.',
      )
      setSubmitting(false)
      return
    }

    onSuccess(result)
    setSubmitting(false)
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

  // Shrink confirmation dialog — shown when 409 days_have_data is returned. It
  // keeps the hero above it so the step reads as part of the same screen.
  if (shrinkConflict) {
    return (
      <div className="trip-form-card">
        {hero}
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
      </div>
    )
  }

  return (
    <div className="trip-form-card">
      {hero}
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
          <span>Continent</span>
          <select
            className="trip-form-select"
            value={continent}
            onChange={(e) => setContinent(e.target.value)}
          >
            <option value="">No continent</option>
            {CONTINENTS.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
          <span className="trip-form-hint">Used to filter your past trips</span>
        </label>

        <div className="trip-form-row">
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
        </div>

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

        <div className="trip-form-field">
          <span>Cover photo</span>
          {/* Hidden file input, opened by the drop zone / Replace button. */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            aria-label="Cover photo"
            onChange={pickCover}
            className="cover-picker-input"
          />
          {coverPreview ? (
            <div className="cover-picker cover-picker--filled">
              <img src={coverPreview} alt="" className="cover-picker-thumb" />
              <div className="cover-picker-meta">
                <span className="cover-picker-filename">
                  {coverFile ? coverFile.name : 'Current cover photo'}
                </span>
                <div className="cover-picker-actions">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Replace
                  </button>
                  <button type="button" className="btn-ghost" onClick={removeCover}>
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="cover-picker cover-picker--empty"
              onClick={() => fileInputRef.current?.click()}
            >
              <span className="cover-picker-icon" aria-hidden="true">
                ↑
              </span>
              <span className="cover-picker-title">Upload a cover photo</span>
              <span className="trip-form-hint">JPG, PNG, WebP or GIF · up to 10 MB</span>
            </button>
          )}
        </div>

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
    </div>
  )
}

import { BOOKING_OPTIONS, type Booking } from './booking'

// Marks are the "Mark as" choices a plan item's chip also offers: skipping
// it (crossed out) and flagging it as spontaneous (wasn't in the plan).
export interface ChipMarks {
  skipped: boolean
  spontaneous: boolean
  onSkip: (skip: boolean) => void
  onSpontaneous: (spontaneous: boolean) => void
  // included: the item is covered by a package, so its booking is the
  // package's — the chip reads "Included" and offers only the marks.
  included?: boolean
}

// BookingChip is the booking status as a small coloured chip that is a native
// <select>: tapping it opens the phone's own picker, and choosing saves. With
// marks (plan items) it also offers Skipped / Spontaneous under "Mark as";
// a skipped item's chip reads "Skipped".
export function BookingChip({
  value,
  label,
  onChange,
  disabled,
  marks,
}: {
  value: Booking
  // label names the thing, for the accessible name ("Booking: Ferry to Barra").
  label: string
  onChange: (next: Booking) => void
  disabled?: boolean
  marks?: ChipMarks
}) {
  const shown = marks?.skipped ? '__skipped' : marks?.included ? '__included' : value
  const tone = marks?.skipped ? 'skipped' : marks?.included ? 'paid' : value
  function pick(v: string) {
    if (!marks) return onChange(v as Booking)
    switch (v) {
      case '__skip':
        return marks.onSkip(true)
      case '__unskip':
        return marks.onSkip(false)
      case '__spontaneous':
        return marks.onSpontaneous(true)
      case '__unspontaneous':
        return marks.onSpontaneous(false)
      default:
        if (!v.startsWith('__')) onChange(v as Booking)
    }
  }
  const bookingOptions = BOOKING_OPTIONS.map((o) => (
    <option key={o.value} value={o.value}>
      {o.label}
    </option>
  ))
  return (
    <select
      className={`bk-chip bk-chip--${tone}`}
      aria-label={`${marks ? 'Status' : 'Booking'}: ${label}`}
      value={shown}
      disabled={disabled}
      onChange={(e) => pick(e.target.value)}
      onClick={(e) => e.stopPropagation()}
    >
      {!marks && bookingOptions}
      {marks && (
        <>
          {marks.skipped && (
            <option value="__skipped" hidden disabled>
              Skipped
            </option>
          )}
          {marks.included ? (
            <option value="__included" disabled>
              Included
            </option>
          ) : (
            <optgroup label="Booking">{bookingOptions}</optgroup>
          )}
          <optgroup label="Mark as">
            {marks.skipped ? (
              <option value="__unskip">Not skipped</option>
            ) : (
              <option value="__skip">Skipped</option>
            )}
            {marks.spontaneous ? (
              <option value="__unspontaneous">Not spontaneous</option>
            ) : (
              <option value="__spontaneous">Spontaneous</option>
            )}
          </optgroup>
        </>
      )}
    </select>
  )
}

// BookingSelect is the same choice as a full-width form field.
export function BookingSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id?: string
  value: Booking
  onChange: (next: Booking) => void
  disabled?: boolean
}) {
  return (
    <select
      id={id}
      className="form-input bk-select"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as Booking)}
    >
      {BOOKING_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

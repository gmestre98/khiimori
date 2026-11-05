import { BOOKING_OPTIONS, type Booking } from './booking'

// BookingChip is the booking status as a small coloured chip that is a native
// <select>: tapping it opens the phone's own picker, and choosing saves.
export function BookingChip({
  value,
  label,
  onChange,
  disabled,
}: {
  value: Booking
  // label names the thing, for the accessible name ("Booking: Ferry to Barra").
  label: string
  onChange: (next: Booking) => void
  disabled?: boolean
}) {
  return (
    <select
      className={`bk-chip bk-chip--${value}`}
      aria-label={`Booking: ${label}`}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as Booking)}
      onClick={(e) => e.stopPropagation()}
    >
      {BOOKING_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
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

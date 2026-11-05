import type { PlanItem, Stay } from '../lib/api'

// Booking is the one booking status shared by stays and plan items.
export type Booking = 'none' | 'to_book' | 'booked' | 'paid'

export const BOOKING_OPTIONS: { value: Booking; label: string }[] = [
  { value: 'none', label: 'No booking' },
  { value: 'to_book', label: 'To book' },
  { value: 'booked', label: 'Booked' },
  { value: 'paid', label: 'Paid' },
]

export const BOOKING_LABEL: Record<Booking, string> = {
  none: 'No booking',
  to_book: 'To book',
  booked: 'Booked',
  paid: 'Paid',
}

// normalizeBooking mirrors the server: canonical values pass through, empty is
// none, and older free text (cached before the change) maps to the closest
// status.
export function normalizeBooking(v: string | null | undefined): Booking {
  const s = (v ?? '').trim().toLowerCase()
  if (s === '' || s === 'none') return 'none'
  if (s === 'to_book' || s === 'to book') return 'to_book'
  if (s === 'booked') return 'booked'
  if (s === 'paid') return 'paid'
  if (/no booking|not needed|walk/.test(s)) return 'none'
  if (/unpaid|not paid|to pay/.test(s)) return 'booked'
  if (/not book|to book|unbook|need|pending|tbc|todo|to do/.test(s)) return 'to_book'
  if (/paid|pago/.test(s)) return 'paid'
  return 'booked'
}

export function bookingOfItem(item: Pick<PlanItem, 'booking_status'>): Booking {
  return normalizeBooking(item.booking_status)
}

// bookingOfStay reads a stay's status; a stay cached before the field existed
// only has paid (paid → paid, otherwise booked, as the migration did).
export function bookingOfStay(stay: Pick<Stay, 'booking_status' | 'paid'>): Booking {
  if (stay.booking_status) return normalizeBooking(stay.booking_status)
  return stay.paid ? 'paid' : 'booked'
}

// itemCountsAsSpent is the Money rule for a plan item: spent when paid or done.
export function itemCountsAsSpent(item: Pick<PlanItem, 'booking_status' | 'status'>): boolean {
  return bookingOfItem(item) === 'paid' || item.status === 'done'
}

// itemCounts reports whether a plan item's cost counts at all: skipped or
// cancelled items drop out unless they were paid.
export function itemCounts(item: Pick<PlanItem, 'booking_status' | 'status'>): boolean {
  const gone = item.status === 'skipped' || item.status === 'cancelled'
  return !gone || bookingOfItem(item) === 'paid'
}

// One status list for plan items and stays: To book, Booked, Paid, Done,
// Skipped, Cancelled, Spontaneous. Several can be on at once; picking one that
// conflicts with another turns the other off:
//   - To book, Booked and Paid exclude each other (one booking state);
//   - Done, Skipped and Cancelled exclude each other (one outcome);
//   - To book and Done exclude each other (done means it no longer needs booking).
// Spontaneous combines with anything. Stored as the item's booking status, its
// lifecycle status and its spontaneous flag.

import type { Booking } from './booking'

export type StatusKey =
  | 'to_book'
  | 'booked'
  | 'paid'
  | 'done'
  | 'skipped'
  | 'cancelled'
  | 'spontaneous'

export type Happened = 'planned' | 'done' | 'skipped' | 'cancelled'

export interface StatusState {
  booking: Booking
  happened: Happened
  spontaneous: boolean
}

export const STATUS_OPTIONS: { key: StatusKey; label: string; hint: string }[] = [
  { key: 'to_book', label: 'To book', hint: 'Still needs booking' },
  { key: 'booked', label: 'Booked', hint: 'Reserved, pay there or later' },
  { key: 'paid', label: 'Paid', hint: 'Counts as spent' },
  { key: 'done', label: 'Done', hint: 'It happened' },
  { key: 'skipped', label: 'Skipped', hint: 'Didn’t do it' },
  { key: 'cancelled', label: 'Cancelled', hint: 'Called off' },
  { key: 'spontaneous', label: 'Spontaneous', hint: 'Wasn’t in the plan' },
]

const BOOKING_KEYS: StatusKey[] = ['to_book', 'booked', 'paid']

// Which statuses a thing can have: stays only have a booking; an item in a
// package takes its booking from the package.
export interface StatusKinds {
  booking: boolean
  happened: boolean
  spontaneous: boolean
}

export function isOn(s: StatusState, key: StatusKey): boolean {
  if (key === 'spontaneous') return s.spontaneous
  if (BOOKING_KEYS.includes(key)) return s.booking === key
  return s.happened === key
}

export function activeKeys(s: StatusState, kinds: StatusKinds): StatusKey[] {
  return STATUS_OPTIONS.map((o) => o.key).filter((k) => available(k, kinds) && isOn(s, k))
}

export function available(key: StatusKey, kinds: StatusKinds): boolean {
  if (key === 'spontaneous') return kinds.spontaneous
  if (BOOKING_KEYS.includes(key)) return kinds.booking
  return kinds.happened
}

// toggle turns one status on or off, turning off whatever it conflicts with.
export function toggle(s: StatusState, key: StatusKey): StatusState {
  const on = isOn(s, key)
  if (key === 'spontaneous') return { ...s, spontaneous: !on }
  if (BOOKING_KEYS.includes(key)) {
    if (on) return { ...s, booking: 'none' }
    const next: StatusState = { ...s, booking: key as Booking }
    if (key === 'to_book' && s.happened === 'done') next.happened = 'planned'
    return next
  }
  if (on) return { ...s, happened: 'planned' }
  const next: StatusState = { ...s, happened: key as Happened }
  if (key === 'done' && s.booking === 'to_book') next.booking = 'none'
  return next
}

// conflictNote says what a toggle turned off, for a one-line hint.
export function conflictNote(before: StatusState, after: StatusState, key: StatusKey): string {
  const lost = STATUS_OPTIONS.filter(
    (o) => o.key !== key && isOn(before, o.key) && !isOn(after, o.key),
  ).map((o) => o.label)
  if (!lost.length || !isOn(after, key)) return ''
  const label = STATUS_OPTIONS.find((o) => o.key === key)!.label
  return `${label} replaced ${lost.join(' and ')}.`
}

// chipText is what the tag on a row says: the active statuses, or "Status".
export function chipText(s: StatusState, kinds: StatusKinds, included?: boolean): string {
  const labels = activeKeys(s, kinds).map((k) => STATUS_OPTIONS.find((o) => o.key === k)!.label)
  if (included) labels.unshift('Included')
  return labels.length ? labels.join(' · ') : 'Status'
}

// chipTone picks the tag's colour from the most telling status.
export function chipTone(s: StatusState, kinds: StatusKinds, included?: boolean): string {
  const k = activeKeys(s, kinds)
  if (k.includes('skipped') || k.includes('cancelled')) return 'skipped'
  if (k.includes('paid') || k.includes('done') || included) return 'paid'
  if (k.includes('to_book')) return 'to_book'
  if (k.includes('booked') || k.includes('spontaneous')) return 'booked'
  return 'none'
}

export function happenedOf(status: string): Happened {
  return status === 'done' || status === 'skipped' || status === 'cancelled' ? status : 'planned'
}

import type { Stay } from '../lib/api'

// coversDay reports whether a stay should occupy a given day's slot: a dated
// stay covers the half-open range [check_in, check_out); a stay with incomplete
// dates is shown on the day it was entered (it has no defined span yet). Shared
// by StaySlot (single day) and TripPlanPage (spreading a stay across the nights
// it covers), so both agree on which days a stay belongs to.
export function coversDay(stay: Stay, date: string): boolean {
  if (!stay.check_in || !stay.check_out) return true
  return stay.check_in <= date && date < stay.check_out
}

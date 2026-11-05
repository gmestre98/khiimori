import { updatePlanItem, updateStay, type PlanItem, type Stay, type StayInput } from '../lib/api'
import { enqueue } from '../lib/mutationQueue'
import type { Booking } from './booking'
import { fieldsFromItem, fieldsToInput, mergeInput } from './planItemForm.helpers'

// stayInputWithBooking is the full edit payload for a stay with only its
// booking status changed (the stay edit endpoint replaces every field).
export function stayInputWithBooking(stay: Stay, booking: Booking): StayInput {
  return {
    name: stay.name,
    location: stay.location ?? null,
    check_in: stay.check_in ?? null,
    check_out: stay.check_out ?? null,
    cost: stay.cost ?? null,
    link: stay.link ?? null,
    booking_status: booking,
    paid: booking === 'paid',
  }
}

// saveStayBooking saves a stay's new booking status (queued when offline) and
// returns the stay as it now is.
export async function saveStayBooking(
  tripId: string,
  stay: Stay,
  booking: Booking,
  online: boolean,
): Promise<Stay> {
  const input = stayInputWithBooking(stay, booking)
  if (online) return updateStay(tripId, stay.id, input)
  await enqueue('updateStay', { tripId, stayId: stay.id, input })
  return { ...stay, booking_status: booking, paid: booking === 'paid' }
}

// savePlanItemBooking saves a plan item's new booking status outside the day
// screen (Money's list), queued when offline; returns the item as it now is.
export async function savePlanItemBooking(
  tripId: string,
  item: PlanItem,
  booking: Booking,
  online: boolean,
): Promise<PlanItem> {
  const input = fieldsToInput(
    { ...fieldsFromItem(item), booking_status: booking },
    item.day_id ?? null,
  )
  if (online) return updatePlanItem(tripId, item.id, input)
  await enqueue('updatePlanItem', { tripId, itemId: item.id, input })
  return mergeInput(item, tripId, input)
}

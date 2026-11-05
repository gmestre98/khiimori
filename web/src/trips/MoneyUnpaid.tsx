import { useMemo, useState } from 'react'
import type { PlanItem, Stay } from '../lib/api'
import { euroWhole } from '../lib/format'
import { useIsOnline } from '../lib/useIsOnline'
import { BookingChip } from './BookingChip'
import type { Booking } from './booking'
import { unpaidRows, type UnpaidRow as Row } from './unpaid'
import { savePlanItemBooking, saveStayBooking } from './bookingSave'
import { packageForItem, packageForStay, usePackages } from './packages'
import type { TripDaysState } from './tripDays'

// MoneyUnpaid is Money's "Not paid yet" list: everything booked but unpaid,
// each with the booking chip so settling up is one tap.
export function MoneyUnpaid({
  tripId,
  tripDays,
  onChanged,
}: {
  tripId: string
  tripDays?: TripDaysState
  onChanged: () => void
}) {
  const online = useIsOnline()
  const packages = usePackages(tripId)
  const [error, setError] = useState<string | null>(null)
  const dates = tripDays?.dates
  const days = tripDays?.days
  const rows = useMemo(
    () =>
      dates && days
        ? unpaidRows(dates, days, {
            stay: (id) => !!packageForStay(packages, id),
            item: (id) => !!packageForItem(packages, id),
          })
        : [],
    [dates, days, packages],
  )

  // reflect puts a changed stay/item into every loaded day that holds it.
  function reflect(changed: { stay?: Stay; item?: PlanItem }) {
    if (!tripDays?.days) return
    for (const day of tripDays.days) {
      if (!day) continue
      if (changed.stay && day.stays.some((s) => s.id === changed.stay!.id)) {
        tripDays.replaceDay({
          ...day,
          stays: day.stays.map((s) => (s.id === changed.stay!.id ? changed.stay! : s)),
        })
      }
      if (changed.item && day.plan_items.some((p) => p.id === changed.item!.id)) {
        tripDays.replaceDay({
          ...day,
          plan_items: day.plan_items.map((p) => (p.id === changed.item!.id ? changed.item! : p)),
        })
      }
    }
  }

  async function change(row: Row, booking: Booking) {
    setError(null)
    try {
      if (row.kind === 'stay') {
        reflect({ stay: await saveStayBooking(tripId, row.stay, booking, online) })
      } else {
        reflect({ item: await savePlanItemBooking(tripId, row.item, booking, online) })
      }
      onChanged()
    } catch {
      setError('Could not change the booking.')
    }
  }

  if (rows.length === 0) return null
  const total = rows.reduce((n, r) => n + (r.cost ?? 0), 0)
  return (
    <section className="money-unpaid" aria-labelledby="money-unpaid-title">
      <div className="money-unpaid-head">
        <h2 id="money-unpaid-title" className="fg-label fg-section-label">
          Not paid yet{total > 0 ? ` · ${euroWhole(total)}` : ''}
        </h2>
        <span className="money-unpaid-count">{rows.length} booked</span>
      </div>
      <ul className="money-unpaid-list">
        {rows.map((r) => {
          const name = r.kind === 'stay' ? r.stay.name : r.item.title
          return (
            <li key={`${r.kind}-${r.kind === 'stay' ? r.stay.id : r.item.id}`}>
              <span className="money-unpaid-body">
                <span className="money-unpaid-name">{name}</span>
                <span className="money-unpaid-sub">{r.sub}</span>
              </span>
              <span className="money-unpaid-cost">{r.cost ? euroWhole(r.cost) : '–'}</span>
              <BookingChip value="booked" label={name} onChange={(b) => void change(r, b)} />
            </li>
          )
        })}
      </ul>
      {error && (
        <p role="alert" className="fg-error">
          {error}
        </p>
      )}
    </section>
  )
}

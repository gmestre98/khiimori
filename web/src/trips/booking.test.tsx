import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Day, PlanItem, Stay } from '../lib/api'
import * as api from '../lib/api'
import { bookingOfStay, itemCounts, itemCountsAsSpent, normalizeBooking } from './booking'
import { unpaidRows } from './unpaid'
import { MoneyUnpaid } from './MoneyUnpaid'
import type { TripDaysState } from './tripDays'

vi.mock('../lib/api', async (orig) => ({
  ...(await orig<typeof import('../lib/api')>()),
  updateStay: vi.fn(),
  updatePlanItem: vi.fn(),
  fetchPackages: vi.fn().mockResolvedValue([]),
}))
vi.mock('../lib/useIsOnline', () => ({ useIsOnline: () => true }))
vi.mock('../lib/resourceCache', () => ({
  readCache: vi.fn().mockResolvedValue(null),
  writeCache: vi.fn().mockResolvedValue(undefined),
}))

const item = (over: Partial<PlanItem>): PlanItem => ({
  id: 'i1',
  trip_id: 'trip-1',
  day_id: 'd1',
  title: 'Djoudj tour',
  kind: 'activity',
  sort_order: 0,
  status: 'planned',
  ...over,
})
const stay = (over: Partial<Stay>): Stay => ({
  id: 's1',
  trip_id: 'trip-1',
  name: 'Hôtel de la Poste',
  check_in: '2026-11-27',
  check_out: '2026-11-29',
  cost: 96,
  ...over,
})
const day = (over: Partial<Day>): Day =>
  ({ id: 'd1', trip_id: 'trip-1', date: '2026-11-27', stays: [], plan_items: [], ...over }) as Day

describe('booking rules', () => {
  it('normalises old free text like the server', () => {
    expect(normalizeBooking(undefined)).toBe('none')
    expect(normalizeBooking('Confirmed')).toBe('booked')
    expect(normalizeBooking('paid online')).toBe('paid')
    expect(normalizeBooking('not booked yet')).toBe('to_book')
    expect(normalizeBooking('no booking needed')).toBe('none')
    expect(normalizeBooking('unpaid')).toBe('booked')
  })

  it('reads a stay without a status from paid', () => {
    expect(bookingOfStay({ paid: true })).toBe('paid')
    expect(bookingOfStay({ paid: false })).toBe('booked')
    expect(bookingOfStay({ paid: false, booking_status: 'to_book' })).toBe('to_book')
  })

  it('counts paid or done as spent; drops unpaid skipped items', () => {
    expect(itemCountsAsSpent({ booking_status: 'paid', status: 'planned' })).toBe(true)
    expect(itemCountsAsSpent({ booking_status: 'none', status: 'done' })).toBe(true)
    expect(itemCountsAsSpent({ booking_status: 'booked', status: 'planned' })).toBe(false)
    expect(itemCounts({ booking_status: 'booked', status: 'skipped' })).toBe(false)
    expect(itemCounts({ booking_status: 'paid', status: 'cancelled' })).toBe(true)
  })

  it('lists booked, unpaid things once, skipping done, packaged and other statuses', () => {
    const s = stay({ booking_status: 'booked' })
    const rows = unpaidRows(
      ['2026-11-27', '2026-11-28'],
      [
        day({
          stays: [s],
          plan_items: [
            item({ id: 'a', booking_status: 'booked', cost: 35 }),
            item({ id: 'b', booking_status: 'booked', status: 'done' }),
            item({ id: 'c', booking_status: 'paid' }),
            item({ id: 'd', booking_status: 'booked', kind: 'note' }),
            item({ id: 'e', booking_status: 'booked' }),
          ],
        }),
        day({ id: 'd2', date: '2026-11-28', stays: [s] }),
      ],
      { stay: () => false, item: (id) => id === 'e' },
    )
    expect(rows.map((r) => (r.kind === 'stay' ? r.stay.id : r.item.id))).toEqual(['s1', 'a'])
    expect(rows[0].sub).toBe('Stay · 27 Nov – 29 Nov')
  })
})

describe('MoneyUnpaid', () => {
  function tripDays(days: Day[]): TripDaysState {
    return { dates: days.map((d) => d.date), days, error: false, replaceDay: vi.fn() }
  }

  it('shows nothing when everything is settled', () => {
    const { container } = render(
      <MoneyUnpaid tripId="trip-1" tripDays={tripDays([day({})])} onChanged={() => {}} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('lists what is booked but unpaid with a total, and marks one paid', async () => {
    const user = userEvent.setup()
    const s = stay({ booking_status: 'booked' })
    const i = item({ booking_status: 'booked', cost: 35, type: 'Activities' })
    vi.mocked(api.updatePlanItem).mockResolvedValue({ ...i, booking_status: 'paid' })
    const td = tripDays([day({ stays: [s], plan_items: [i] })])
    const onChanged = vi.fn()
    render(<MoneyUnpaid tripId="trip-1" tripDays={td} onChanged={onChanged} />)

    const section = screen.getByRole('region', { name: /Not paid yet/ })
    expect(within(section).getByRole('heading')).toHaveTextContent('Not paid yet · €131')
    expect(within(section).getByText('2 booked')).toBeInTheDocument()
    await user.selectOptions(
      within(section).getByRole('combobox', { name: 'Booking: Djoudj tour' }),
      'paid',
    )
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(api.updatePlanItem).toHaveBeenCalledWith(
      'trip-1',
      'i1',
      expect.objectContaining({ title: 'Djoudj tour', booking_status: 'paid', cost: 35 }),
    )
    expect(td.replaceDay).toHaveBeenCalledWith(
      expect.objectContaining({
        plan_items: [expect.objectContaining({ id: 'i1', booking_status: 'paid' })],
      }),
    )
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TripBudgetEditor, TripDayExtra } from './BudgetEditor'
import * as api from '../lib/api'
import type { BudgetRollup } from '../lib/api'
import type { DayOption } from './TripExpenses'

vi.mock('../lib/api', async (importOriginal) => {
  const orig = await importOriginal<typeof api>()
  return {
    ...orig,
    setDayBudgetLine: vi.fn().mockResolvedValue({}),
    setTripBudgetLine: vi.fn(async (_t: string, input: api.SetBudgetLineInput) => ({
      id: 'l1',
      trip_id: 'trip-1',
      day_id: null,
      actual_amount: 0,
      ...input,
    })),
  }
})

vi.mock('../lib/mutationQueue', () => ({ enqueue: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../lib/useIsOnline', () => ({ useIsOnline: () => true }))

function makeRollup(overrides?: Partial<BudgetRollup>): BudgetRollup {
  return {
    trip_total: 0,
    by_category: {},
    by_day: {},
    by_day_category: {},
    estimated_trip_total: 0,
    estimated_by_category: {},
    estimated_by_day: {},
    planned_trip_total: 0,
    planned_by_category: {},
    planned_by_day: {},
    ...overrides,
  }
}

const dayOptions: DayOption[] = [
  { id: 'day-1', date: '2026-07-12', label: 'Jul 12' },
  { id: 'day-2', date: '2026-07-13', label: 'Jul 13' },
]

beforeEach(() => vi.clearAllMocks())
afterEach(() => cleanup())

describe('TripDayExtra', () => {
  it('defaults to the first day and seeds extras from that day', () => {
    render(
      <TripDayExtra
        tripId="trip-1"
        rollup={makeRollup({ planned_by_day_category: { 'day-1': { Food: 25 } } })}
        dayOptions={dayOptions}
        onChanged={() => {}}
      />,
    )
    expect((screen.getByLabelText('Day to add extra to') as HTMLSelectElement).value).toBe('day-1')
    expect(screen.getByLabelText(/Extra budget for Food/)).toHaveTextContent('€25.00')
  })

  it('re-seeds the editor when a different day is picked', async () => {
    const user = userEvent.setup()
    render(
      <TripDayExtra
        tripId="trip-1"
        rollup={makeRollup({
          planned_by_day_category: { 'day-1': { Food: 25 }, 'day-2': { Food: 40 } },
        })}
        dayOptions={dayOptions}
        onChanged={() => {}}
      />,
    )
    expect(screen.getByLabelText(/Extra budget for Food/)).toHaveTextContent('€25.00')
    await user.selectOptions(screen.getByLabelText('Day to add extra to'), 'day-2')
    expect(screen.getByLabelText(/Extra budget for Food/)).toHaveTextContent('€40.00')
  })

  it('saves an extra against the selected day', async () => {
    const onChanged = vi.fn()
    const user = userEvent.setup()
    render(
      <TripDayExtra
        tripId="trip-1"
        rollup={makeRollup()}
        dayOptions={dayOptions}
        onChanged={onChanged}
      />,
    )
    await user.click(screen.getByLabelText(/Extra budget for Food/))
    await user.type(screen.getByLabelText('Extra budget for Food'), '30')
    await user.keyboard('{Enter}')
    await waitFor(() => {
      expect(api.setDayBudgetLine).toHaveBeenCalledWith('trip-1', 'day-1', {
        category: 'Food',
        planned_amount: 30,
      })
    })
    expect(onChanged).toHaveBeenCalled()
  })

  it('shows an empty hint when the trip has no days', () => {
    render(
      <TripDayExtra tripId="trip-1" rollup={makeRollup()} dayOptions={[]} onChanged={() => {}} />,
    )
    expect(screen.getByText(/No days to add an extra to yet/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Day to add extra to')).not.toBeInTheDocument()
  })
})

describe('TripBudgetEditor', () => {
  it('clearing a whole-trip amount sets it to 0', async () => {
    const user = userEvent.setup()
    const onUpdated = vi.fn()
    render(
      <TripBudgetEditor
        tripId="trip-1"
        dayCount={18}
        rollup={null}
        onUpdated={onUpdated}
        lines={[
          {
            id: 'l1',
            trip_id: 'trip-1',
            day_id: null,
            category: 'Stays',
            scope: 'trip',
            planned_amount: 1000,
            actual_amount: 0,
          },
        ]}
      />,
    )
    await user.click(screen.getByRole('button', { name: /Whole-trip budget for Stays/ }))
    const input = screen.getByLabelText(/Whole-trip budget for Stays/)
    await user.clear(input)
    await user.tab()
    await waitFor(() =>
      expect(api.setTripBudgetLine).toHaveBeenCalledWith('trip-1', {
        category: 'Stays',
        scope: 'trip',
        planned_amount: 0,
      }),
    )
    expect(screen.queryByText('Enter a valid non-negative amount')).not.toBeInTheDocument()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TripExpenses, type DayOption } from './TripExpenses'
import * as api from '../lib/api'
import type { CostEntry } from '../lib/api'

vi.mock('../lib/api', async (importOriginal) => {
  const orig = await importOriginal<typeof api>()
  return {
    ...orig,
    createCostEntry: vi.fn(),
    updateCostEntry: vi.fn(),
    deleteCostEntry: vi.fn(),
  }
})

vi.mock('../lib/mutationQueue', () => ({ enqueue: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../lib/useIsOnline', () => ({ useIsOnline: () => true }))

const dayOptions: DayOption[] = [{ id: 'day-4', date: '2026-07-08', label: 'Jul 08' }]

function entry(overrides?: Partial<CostEntry>): CostEntry {
  return {
    id: 'ce-1',
    trip_id: 'trip-1',
    day_id: '',
    plan_item_id: '',
    category: 'Food',
    amount: 6.5,
    note: 'Street food',
    created_at: '2026-07-08T00:00:00Z',
    ...overrides,
  }
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => cleanup())

describe('TripExpenses', () => {
  it('labels a trip-level expense "Whole trip" and a day-linked one by date', () => {
    render(
      <TripExpenses
        tripId="trip-1"
        entries={[entry(), entry({ id: 'ce-2', day_id: 'day-4', note: 'Water' })]}
        dayOptions={dayOptions}
        onAdded={vi.fn()}
        onUpdated={vi.fn()}
        onDeleted={vi.fn()}
      />,
    )
    expect(screen.getByText('Whole trip')).toBeInTheDocument()
    expect(screen.getByText('Jul 08')).toBeInTheDocument()
  })

  it('logs a trip-level expense (no day) and reports it up', async () => {
    const user = userEvent.setup()
    const created = entry({ id: 'ce-new', amount: 12.5, note: 'Souvenir' })
    vi.mocked(api.createCostEntry).mockResolvedValue(created)
    const onAdded = vi.fn()

    render(
      <TripExpenses
        tripId="trip-1"
        entries={[]}
        dayOptions={dayOptions}
        onAdded={onAdded}
        onUpdated={vi.fn()}
        onDeleted={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: '+ Log expense' }))
    await user.type(screen.getByLabelText('Amount in EUR'), '12.5')
    await user.type(screen.getByLabelText('Note'), 'Souvenir')
    await user.click(screen.getByRole('button', { name: 'Log' }))

    await waitFor(() => expect(api.createCostEntry).toHaveBeenCalledTimes(1))
    const input = vi.mocked(api.createCostEntry).mock.calls[0][1]
    expect(input).toMatchObject({ amount: 12.5, note: 'Souvenir' })
    // No day chosen → day_id omitted (trip-level, not tied to any activity).
    expect(input.day_id).toBeUndefined()
    expect(onAdded).toHaveBeenCalledWith(created)
  })

  it('pins an expense to the chosen day', async () => {
    const user = userEvent.setup()
    vi.mocked(api.createCostEntry).mockResolvedValue(entry({ day_id: 'day-4' }))

    render(
      <TripExpenses
        tripId="trip-1"
        entries={[]}
        dayOptions={dayOptions}
        onAdded={vi.fn()}
        onUpdated={vi.fn()}
        onDeleted={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: '+ Log expense' }))
    await user.type(screen.getByLabelText('Amount in EUR'), '3')
    await user.selectOptions(screen.getByLabelText('Day (optional)'), 'day-4')
    await user.click(screen.getByRole('button', { name: 'Log' }))

    await waitFor(() => expect(api.createCostEntry).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.createCostEntry).mock.calls[0][1].day_id).toBe('day-4')
  })

  it('deletes an expense', async () => {
    const user = userEvent.setup()
    vi.mocked(api.deleteCostEntry).mockResolvedValue(undefined)
    const onDeleted = vi.fn()

    render(
      <TripExpenses
        tripId="trip-1"
        entries={[entry()]}
        dayOptions={dayOptions}
        onAdded={vi.fn()}
        onUpdated={vi.fn()}
        onDeleted={onDeleted}
      />,
    )
    await user.click(screen.getByRole('button', { name: /Delete Food expense/ }))
    await waitFor(() => expect(api.deleteCostEntry).toHaveBeenCalledWith('trip-1', 'ce-1'))
    expect(onDeleted).toHaveBeenCalledWith('ce-1')
  })
})

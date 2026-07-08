import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StaySlot } from './StaySlot'
import * as api from '../lib/api'
import type { Day, Stay } from '../lib/api'
import { enqueue } from '../lib/mutationQueue'

vi.mock('../lib/api', async (importOriginal) => {
  const orig = await importOriginal<typeof api>()
  return {
    ...orig,
    createStay: vi.fn(),
    updateStay: vi.fn(),
    deleteStay: vi.fn(),
    // The stay location now uses the shared LocationField, which runs a live
    // geocode + Places autocomplete. Stub both so tests don't hit the network.
    geocodeLocation: vi.fn().mockResolvedValue(null),
    fetchAutocomplete: vi.fn().mockResolvedValue([]),
  }
})

vi.mock('../lib/mutationQueue', () => ({
  enqueue: vi.fn().mockResolvedValue(undefined),
}))

let online = true
vi.mock('../lib/useIsOnline', () => ({
  useIsOnline: () => online,
}))

function makeDay(overrides?: Partial<Day>): Day {
  return {
    id: 'day-1',
    trip_id: 'trip-1',
    date: '2026-06-02',
    index: 1,
    notes: '',
    stays: [],
    plan_items: [],
    ...overrides,
  }
}

function makeStay(overrides?: Partial<Stay>): Stay {
  return {
    id: 'stay-1',
    trip_id: 'trip-1',
    name: 'Hotel Paris',
    check_in: '2026-06-01',
    check_out: '2026-06-04',
    ...overrides,
  }
}

beforeEach(() => {
  online = true
  vi.clearAllMocks()
})

afterEach(() => cleanup())

describe('StaySlot', () => {
  it('shows an add affordance when the night has no stay', () => {
    render(<StaySlot day={makeDay()} tripId="trip-1" setStays={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Add where you're staying/ })).toBeInTheDocument()
  })

  it('adds a stay and reflects it into the parent', async () => {
    const user = userEvent.setup()
    const created = makeStay({ name: 'Grand Hotel' })
    vi.mocked(api.createStay).mockResolvedValue(created)
    const setStays = vi.fn()

    render(<StaySlot day={makeDay()} tripId="trip-1" setStays={setStays} />)
    await user.click(screen.getByRole('button', { name: /Add where you're staying/ }))
    await user.type(screen.getByLabelText('Name'), 'Grand Hotel')
    await user.click(screen.getByRole('button', { name: 'Add stay' }))

    await waitFor(() => expect(api.createStay).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.createStay).mock.calls[0][1]).toMatchObject({ name: 'Grand Hotel' })
    expect(setStays).toHaveBeenCalledWith([created])
  })

  it('labels the check-in night and the middle nights', () => {
    const stay = makeStay()
    const { rerender } = render(
      <StaySlot
        day={makeDay({ date: '2026-06-01', stays: [stay] })}
        tripId="trip-1"
        setStays={vi.fn()}
      />,
    )
    expect(screen.getByText('checking in')).toBeInTheDocument()

    rerender(
      <StaySlot
        day={makeDay({ date: '2026-06-02', stays: [stay] })}
        tripId="trip-1"
        setStays={vi.fn()}
      />,
    )
    expect(screen.getByText('night 2 of 3')).toBeInTheDocument()
  })

  it('edits the existing stay', async () => {
    const user = userEvent.setup()
    const stay = makeStay()
    vi.mocked(api.updateStay).mockResolvedValue({ ...stay, name: 'Hotel Lisboa' })
    const setStays = vi.fn()

    render(<StaySlot day={makeDay({ stays: [stay] })} tripId="trip-1" setStays={setStays} />)
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const name = screen.getByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Hotel Lisboa')
    await user.click(screen.getByRole('button', { name: 'Save stay' }))

    await waitFor(() => expect(api.updateStay).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.updateStay).mock.calls[0][1]).toBe('stay-1')
    expect(vi.mocked(api.updateStay).mock.calls[0][2]).toMatchObject({ name: 'Hotel Lisboa' })
  })

  it('removes the stay', async () => {
    const user = userEvent.setup()
    vi.mocked(api.deleteStay).mockResolvedValue(undefined)
    const setStays = vi.fn()

    render(<StaySlot day={makeDay({ stays: [makeStay()] })} tripId="trip-1" setStays={setStays} />)
    await user.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(api.deleteStay).toHaveBeenCalledWith('trip-1', 'stay-1'))
    expect(setStays).toHaveBeenCalledWith([])
  })

  it('surfaces an overlap conflict from the API', async () => {
    const user = userEvent.setup()
    vi.mocked(api.createStay).mockRejectedValue(new api.StayOverlapError('overlap'))

    render(<StaySlot day={makeDay()} tripId="trip-1" setStays={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /Add where you're staying/ }))
    await user.type(screen.getByLabelText('Name'), 'Second Hotel')
    await user.click(screen.getByRole('button', { name: 'Add stay' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/already covers those nights/),
    )
  })

  it('marks a stay with a cost paid straight from the card', async () => {
    const user = userEvent.setup()
    const stay = makeStay({ cost: 120, paid: false })
    vi.mocked(api.updateStay).mockResolvedValue({ ...stay, paid: true })
    const setStays = vi.fn()

    render(<StaySlot day={makeDay({ stays: [stay] })} tripId="trip-1" setStays={setStays} />)
    // Unpaid cost shows an "Upcoming" badge and a "Mark paid" action.
    expect(screen.getByText('Upcoming')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mark paid' }))

    await waitFor(() => expect(api.updateStay).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.updateStay).mock.calls[0][2]).toMatchObject({ paid: true, cost: 120 })
  })

  it('hides the paid toggle when the stay has no cost', () => {
    render(<StaySlot day={makeDay({ stays: [makeStay()] })} tripId="trip-1" setStays={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /Mark paid/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Upcoming')).not.toBeInTheDocument()
  })

  it('queues the add offline instead of calling the API', async () => {
    const user = userEvent.setup()
    online = false
    const setStays = vi.fn()

    render(<StaySlot day={makeDay()} tripId="trip-1" setStays={setStays} />)
    await user.click(screen.getByRole('button', { name: /Add where you're staying/ }))
    await user.type(screen.getByLabelText('Name'), 'Offline Inn')
    await user.click(screen.getByRole('button', { name: 'Add stay' }))

    await waitFor(() => expect(enqueue).toHaveBeenCalledTimes(1))
    expect(vi.mocked(enqueue).mock.calls[0][0]).toBe('createStay')
    expect(api.createStay).not.toHaveBeenCalled()
    expect(setStays).toHaveBeenCalled()
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DayView } from './DayView'
import * as api from '../lib/api'
import type { Day, PlanItem, Stay } from '../lib/api'

function makeDay(overrides?: Partial<Day>): Day {
  return {
    id: 'day-1',
    trip_id: 'trip-1',
    date: '2026-06-01',
    index: 0,
    notes: '',
    stays: [],
    plan_items: [],
    ...overrides,
  }
}

function makePlanItem(overrides?: Partial<PlanItem>): PlanItem {
  return {
    id: 'item-1',
    trip_id: 'trip-1',
    day_id: 'day-1',
    title: 'Visit museum',
    sort_order: 0,
    status: 'planned',
    ...overrides,
  }
}

function makeStay(overrides?: Partial<Stay>): Stay {
  return {
    id: 'stay-1',
    trip_id: 'trip-1',
    name: 'Hotel Paris',
    location: 'Paris',
    check_in: '2026-06-01',
    check_out: '2026-06-03',
    ...overrides,
  }
}

vi.mock('../lib/api', async (importOriginal) => {
  const orig = await importOriginal<typeof api>()
  return {
    ...orig,
    fetchDay: vi.fn(),
  }
})

function renderDayView(date = '2026-06-01', tripId = 'trip-1') {
  return render(
    <MemoryRouter initialEntries={[`/trips/${tripId}/days/${date}`]}>
      <Routes>
        <Route path="/trips/:tripId/days/:date" element={<DayView />} />
        <Route path="/trips/:tripId/backlog" element={<div>Backlog</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('DayView', () => {
  it('shows loading state before data arrives', () => {
    vi.mocked(api.fetchDay).mockReturnValue(new Promise(() => {}))
    renderDayView()
    expect(screen.getByText('Loading day…')).toBeInTheDocument()
  })

  it('renders day header and date after load', async () => {
    vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
    renderDayView()
    await waitFor(() => expect(screen.getByText('Day 1')).toBeInTheDocument())
    expect(screen.getByText('2026-06-01')).toBeInTheDocument()
  })

  it('shows error message on fetch failure', async () => {
    vi.mocked(api.fetchDay).mockRejectedValue(new Error('network'))
    renderDayView()
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load day.')
  })

  it('renders timed items in the Schedule section', async () => {
    const item = makePlanItem({ id: 'i1', title: 'Morning run', start_time: '07:00:00' })
    vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
    renderDayView()
    await waitFor(() => expect(screen.getByText('Schedule')).toBeInTheDocument())
    expect(screen.getByText('Morning run')).toBeInTheDocument()
    expect(screen.getByText('07:00')).toBeInTheDocument()
  })

  it('renders untimed items in the Activities section', async () => {
    const item = makePlanItem({ id: 'i2', title: 'Buy souvenirs' })
    vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
    renderDayView()
    await waitFor(() => expect(screen.getByText('Activities')).toBeInTheDocument())
    expect(screen.getByText('Buy souvenirs')).toBeInTheDocument()
  })

  it('does not show Schedule section when no timed items', async () => {
    const item = makePlanItem({ id: 'i3', title: 'Untimed' })
    vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
    renderDayView()
    await waitFor(() => expect(screen.getByText('Activities')).toBeInTheDocument())
    expect(screen.queryByText('Schedule')).not.toBeInTheDocument()
  })

  it('renders stays in the Staying section', async () => {
    const stay = makeStay()
    vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ stays: [stay] }))
    renderDayView()
    await waitFor(() => expect(screen.getByText('Staying')).toBeInTheDocument())
    expect(screen.getByText('Hotel Paris')).toBeInTheDocument()
    expect(screen.getByText('Paris')).toBeInTheDocument()
  })

  it('shows done badge on done items', async () => {
    const item = makePlanItem({ id: 'i4', title: 'Done task', status: 'done' })
    vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
    renderDayView()
    await waitFor(() => expect(screen.getByText('Done task')).toBeInTheDocument())
    expect(screen.getByText('Done')).toBeInTheDocument()
    expect(screen.getByLabelText(/Done task — Done/)).toBeInTheDocument()
  })

  it('shows skipped badge on skipped items', async () => {
    const item = makePlanItem({ id: 'i5', title: 'Skipped task', status: 'skipped' })
    vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
    renderDayView()
    await waitFor(() => expect(screen.getByText('Skipped task')).toBeInTheDocument())
    expect(screen.getByText('Skipped')).toBeInTheDocument()
  })

  it('shows cancelled badge on cancelled items', async () => {
    const item = makePlanItem({ id: 'i6', title: 'Cancelled task', status: 'cancelled' })
    vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
    renderDayView()
    await waitFor(() => expect(screen.getByText('Cancelled task')).toBeInTheDocument())
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
  })

  it('shows empty message when no items or stays', async () => {
    vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
    renderDayView()
    await waitFor(() => expect(screen.getByText('Nothing planned yet.')).toBeInTheDocument())
  })

  it('renders backlog link', async () => {
    vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
    renderDayView()
    await waitFor(() => expect(screen.getByRole('link', { name: /Ideas backlog/i })).toBeInTheDocument())
  })

  it('renders notes when present', async () => {
    vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ notes: 'Arrive early' }))
    renderDayView()
    await waitFor(() => expect(screen.getByText('Arrive early')).toBeInTheDocument())
  })
})

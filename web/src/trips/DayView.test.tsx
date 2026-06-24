import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DayView } from './DayView'
import * as api from '../lib/api'
import type { Day, PlanItem, Stay, Trip } from '../lib/api'

function makeTrip(overrides?: Partial<Trip>): Trip {
  return {
    id: 'trip-1',
    owner_id: 'user-1',
    name: 'Test Trip',
    destinations: [],
    start_date: '2026-06-01',
    end_date: '2026-06-03',
    base_currency: 'EUR',
    cover: '',
    status: 'upcoming',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    is_current: false,
    ...overrides,
  }
}

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
    createPlanItem: vi.fn(),
    updatePlanItem: vi.fn(),
    setPlanItemStatus: vi.fn(),
    demotePlanItem: vi.fn(),
    movePlanItem: vi.fn(),
    reorderPlanItems: vi.fn(),
  }
})

vi.mock('./useTripShell', () => ({
  useTripShell: vi.fn(() => ({ trip: makeTrip() })),
}))

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
    // The badge is in a .plan-item-status-badge span; the select also has a "Done" option.
    expect(document.querySelector('.plan-item-status-badge')).toHaveTextContent('Done')
    expect(screen.getByLabelText(/Done task — Done/)).toBeInTheDocument()
  })

  it('shows skipped badge on skipped items', async () => {
    const item = makePlanItem({ id: 'i5', title: 'Skipped task', status: 'skipped' })
    vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
    renderDayView()
    await waitFor(() => expect(screen.getByText('Skipped task')).toBeInTheDocument())
    expect(document.querySelector('.plan-item-status-badge')).toHaveTextContent('Skipped')
  })

  it('shows cancelled badge on cancelled items', async () => {
    const item = makePlanItem({ id: 'i6', title: 'Cancelled task', status: 'cancelled' })
    vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
    renderDayView()
    await waitFor(() => expect(screen.getByText('Cancelled task')).toBeInTheDocument())
    expect(document.querySelector('.plan-item-status-badge')).toHaveTextContent('Cancelled')
  })

  it('shows empty message when no items or stays', async () => {
    vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
    renderDayView()
    await waitFor(() => expect(screen.getByText('Nothing planned yet.')).toBeInTheDocument())
  })

  it('renders backlog link', async () => {
    vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
    renderDayView()
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /Ideas backlog/i })).toBeInTheDocument(),
    )
  })

  it('renders notes when present', async () => {
    vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ notes: 'Arrive early' }))
    renderDayView()
    await waitFor(() => expect(screen.getByText('Arrive early')).toBeInTheDocument())
  })

  describe('quick add', () => {
    it('renders the quick add form after load', async () => {
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
      renderDayView()
      await waitFor(() => expect(screen.getByLabelText('Title')).toBeInTheDocument())
    })

    it('adds a new item and shows it in the list', async () => {
      const user = userEvent.setup()
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
      const newItem = makePlanItem({ id: 'new-1', title: 'New activity' })
      vi.mocked(api.createPlanItem).mockResolvedValue(newItem)

      renderDayView()
      await waitFor(() => expect(screen.getByLabelText('Title')).toBeInTheDocument())

      await user.type(screen.getByLabelText('Title'), 'New activity')
      await user.click(screen.getByRole('button', { name: 'Add' }))

      await waitFor(() => expect(screen.getByText('New activity')).toBeInTheDocument())
      expect(api.createPlanItem).toHaveBeenCalledWith(
        'trip-1',
        expect.objectContaining({ title: 'New activity', day_id: 'day-1' }),
      )
    })

    it('shows error when add fails', async () => {
      const user = userEvent.setup()
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
      vi.mocked(api.createPlanItem).mockRejectedValue(new Error('network'))

      renderDayView()
      await waitFor(() => expect(screen.getByLabelText('Title')).toBeInTheDocument())

      await user.type(screen.getByLabelText('Title'), 'Bad item')
      await user.click(screen.getByRole('button', { name: 'Add' }))

      await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
      expect(screen.getByRole('alert')).toHaveTextContent('Could not add item.')
    })

    it('clears the title input after a successful add', async () => {
      const user = userEvent.setup()
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
      vi.mocked(api.createPlanItem).mockResolvedValue(
        makePlanItem({ id: 'new-1', title: 'Grab a coffee' }),
      )

      renderDayView()
      await waitFor(() => expect(screen.getByLabelText('Title')).toBeInTheDocument())

      const input = screen.getByLabelText('Title') as HTMLInputElement
      await user.type(input, 'Grab a coffee')
      await user.click(screen.getByRole('button', { name: 'Add' }))

      await waitFor(() => expect(input.value).toBe(''))
    })

    it('expands optional fields when More options is clicked', async () => {
      const user = userEvent.setup()
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
      renderDayView()
      await waitFor(() => expect(screen.getByLabelText('Title')).toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: 'More options' }))
      expect(screen.getByLabelText('Location')).toBeInTheDocument()
    })
  })

  describe('inline edit', () => {
    it('clicking a plan item shows the edit form', async () => {
      const user = userEvent.setup()
      const item = makePlanItem({ title: 'Visit museum' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
      renderDayView()
      await waitFor(() => expect(screen.getByText('Visit museum')).toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: /Edit Visit museum/ }))
      // The editing li has class plan-item--editing; query within it to avoid
      // matching the quick-add form that is also on the page.
      const editingLi = document.querySelector('.plan-item--editing')!
      const titleInput = within(editingLi as HTMLElement).getByLabelText('Title')
      expect(titleInput).toBeInTheDocument()
      expect((titleInput as HTMLInputElement).value).toBe('Visit museum')
    })

    it('saves the edit and reflects the update', async () => {
      const user = userEvent.setup()
      const item = makePlanItem({ title: 'Visit museum' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
      const updated = makePlanItem({ title: 'Visit gallery' })
      vi.mocked(api.updatePlanItem).mockResolvedValue(updated)

      renderDayView()
      await waitFor(() => expect(screen.getByText('Visit museum')).toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: /Edit Visit museum/ }))
      const editingLi = document.querySelector('.plan-item--editing')!
      const input = within(editingLi as HTMLElement).getByLabelText('Title')
      await user.clear(input)
      await user.type(input, 'Visit gallery')
      await user.click(within(editingLi as HTMLElement).getByRole('button', { name: 'Save' }))

      await waitFor(() => expect(screen.getByText('Visit gallery')).toBeInTheDocument())
      expect(api.updatePlanItem).toHaveBeenCalledWith(
        'trip-1',
        'item-1',
        expect.objectContaining({ title: 'Visit gallery' }),
      )
    })

    it('cancels the edit and restores the item row', async () => {
      const user = userEvent.setup()
      const item = makePlanItem({ title: 'Visit museum' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
      renderDayView()
      await waitFor(() => expect(screen.getByText('Visit museum')).toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: /Edit Visit museum/ }))
      const editingLi = document.querySelector('.plan-item--editing')!
      expect(within(editingLi as HTMLElement).getByLabelText('Title')).toBeInTheDocument()

      await user.click(within(editingLi as HTMLElement).getByRole('button', { name: 'Cancel' }))
      expect(document.querySelector('.plan-item--editing')).not.toBeInTheDocument()
      expect(screen.getByText('Visit museum')).toBeInTheDocument()
    })

    it('shows error when save fails', async () => {
      const user = userEvent.setup()
      const item = makePlanItem({ title: 'Visit museum' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
      vi.mocked(api.updatePlanItem).mockRejectedValue(new Error('network'))

      renderDayView()
      await waitFor(() => expect(screen.getByText('Visit museum')).toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: /Edit Visit museum/ }))
      const editingLi = document.querySelector('.plan-item--editing')!
      await user.click(within(editingLi as HTMLElement).getByRole('button', { name: 'Save' }))

      await waitFor(() =>
        expect(within(editingLi as HTMLElement).getByRole('alert')).toBeInTheDocument(),
      )
      expect(within(editingLi as HTMLElement).getByRole('alert')).toHaveTextContent(
        'Could not save changes.',
      )
    })
  })

  describe('re-planning affordances', () => {
    it('renders a status select for each plan item', async () => {
      const item = makePlanItem({ title: 'Visit museum' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
      renderDayView()
      await waitFor(() => expect(screen.getByText('Visit museum')).toBeInTheDocument())
      expect(screen.getByLabelText('Status: planned')).toBeInTheDocument()
    })

    it('changing the status select calls setPlanItemStatus and updates the badge', async () => {
      const user = userEvent.setup()
      const item = makePlanItem({ title: 'Visit museum', status: 'planned' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
      const updated = makePlanItem({ title: 'Visit museum', status: 'done' })
      vi.mocked(api.setPlanItemStatus).mockResolvedValue(updated)

      renderDayView()
      await waitFor(() => expect(screen.getByLabelText('Status: planned')).toBeInTheDocument())

      await user.selectOptions(screen.getByLabelText('Status: planned'), 'done')

      await waitFor(() => expect(api.setPlanItemStatus).toHaveBeenCalledWith('trip-1', 'item-1', 'done'))
      await waitFor(() =>
        expect(document.querySelector('.plan-item-status-badge')).toHaveTextContent('Done'),
      )
    })

    it('renders a Move… button on each plan item', async () => {
      const item = makePlanItem({ title: 'Visit museum' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
      renderDayView()
      await waitFor(() => expect(screen.getByText('Visit museum')).toBeInTheDocument())
      expect(
        screen.getByRole('button', { name: /Move Visit museum to another day/ }),
      ).toBeInTheDocument()
    })

    it('clicking Move… shows the day picker', async () => {
      const user = userEvent.setup()
      const item = makePlanItem({ title: 'Visit museum' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
      renderDayView()
      await waitFor(() => expect(screen.getByText('Visit museum')).toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: /Move Visit museum to another day/ }))
      expect(screen.getByLabelText('Target day')).toBeInTheDocument()
    })

    it('confirming Move calls movePlanItem and removes the item', async () => {
      const user = userEvent.setup()
      const item = makePlanItem({ title: 'Visit museum' })
      vi.mocked(api.fetchDay)
        .mockResolvedValueOnce(makeDay({ plan_items: [item] })) // initial load
        .mockResolvedValueOnce(makeDay({ id: 'day-2', date: '2026-06-02' })) // target day lookup
      vi.mocked(api.movePlanItem).mockResolvedValue({ ...item, day_id: 'day-2' })

      renderDayView()
      await waitFor(() => expect(screen.getByText('Visit museum')).toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: /Move Visit museum to another day/ }))
      await user.click(screen.getByRole('button', { name: 'Move' }))

      await waitFor(() => expect(screen.queryByText('Visit museum')).not.toBeInTheDocument())
      expect(api.movePlanItem).toHaveBeenCalledWith('trip-1', 'item-1', 'day-2')
    })

    it('renders a → Backlog button on each plan item', async () => {
      const item = makePlanItem({ title: 'Visit museum' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
      renderDayView()
      await waitFor(() => expect(screen.getByText('Visit museum')).toBeInTheDocument())
      expect(screen.getByRole('button', { name: /Move Visit museum to backlog/ })).toBeInTheDocument()
    })

    it('clicking → Backlog demotes the item and removes it from the view', async () => {
      const user = userEvent.setup()
      const item = makePlanItem({ title: 'Visit museum' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
      vi.mocked(api.demotePlanItem).mockResolvedValue({ ...item, day_id: undefined })

      renderDayView()
      await waitFor(() => expect(screen.getByText('Visit museum')).toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: /Move Visit museum to backlog/ }))

      await waitFor(() => expect(screen.queryByText('Visit museum')).not.toBeInTheDocument())
      expect(api.demotePlanItem).toHaveBeenCalledWith('trip-1', 'item-1')
    })

    it('untimed items render drag handles', async () => {
      const item = makePlanItem({ title: 'Buy souvenirs' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
      renderDayView()
      await waitFor(() => expect(screen.getByText('Buy souvenirs')).toBeInTheDocument())
      expect(document.querySelector('.plan-item-drag-handle')).toBeInTheDocument()
    })

    it('timed items do not render drag handles', async () => {
      const item = makePlanItem({ title: 'Morning run', start_time: '07:00:00' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
      renderDayView()
      await waitFor(() => expect(screen.getByText('Morning run')).toBeInTheDocument())
      expect(document.querySelector('.plan-item-drag-handle')).not.toBeInTheDocument()
    })
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DayView } from './DayView'
import * as api from '../lib/api'
import type { Day, PlanItem, Stay, Trip } from '../lib/api'
import { enqueue } from '../lib/mutationQueue'

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
    fetchBudgetRollup: vi.fn().mockResolvedValue({
      trip_total: 0,
      by_category: {},
      by_day: {},
      by_day_category: {},
      planned_trip_total: 0,
      planned_by_category: {},
      planned_by_day: {},
    }),
    createPlanItem: vi.fn(),
    updatePlanItem: vi.fn(),
    setPlanItemStatus: vi.fn(),
    demotePlanItem: vi.fn(),
    deletePlanItem: vi.fn(),
    movePlanItem: vi.fn(),
    reorderPlanItems: vi.fn(),
    setDayBudgetLine: vi.fn(),
    fetchDayRoute: vi.fn(),
    geocodeLocation: vi.fn().mockResolvedValue(null),
    fetchAutocomplete: vi.fn().mockResolvedValue([]),
  }
})

vi.mock('./useTripShell', () => ({
  useTripShell: vi.fn(() => ({ trip: makeTrip() })),
}))

// The offline write queue is exercised in offlineIntegration.test.ts; here we
// only assert DayView routes an offline add through it, so a stub is enough.
vi.mock('../lib/mutationQueue', () => ({
  enqueue: vi.fn().mockResolvedValue(undefined),
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

beforeEach(() => {
  vi.mocked(api.fetchBudgetRollup).mockResolvedValue({
    trip_total: 0,
    by_category: {},
    by_day: {},
    by_day_category: {},
    planned_trip_total: 0,
    planned_by_category: {},
    planned_by_day: {},
  })
  vi.mocked(api.fetchDayRoute).mockResolvedValue({ waypoints: [] })
  // Location field defaults: no suggestions, unresolved geocode — individual
  // tests override as needed. Restored here since afterEach resets mock state.
  vi.mocked(api.fetchAutocomplete).mockResolvedValue([])
  vi.mocked(api.geocodeLocation).mockResolvedValue(null)
  // The "More details" disclosure persists to localStorage; reset it so each
  // test starts from the collapsed default.
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
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
    expect(screen.getByText('Monday, Jun 01 2026')).toBeInTheDocument()
  })

  it('shows error message on fetch failure', async () => {
    vi.mocked(api.fetchDay).mockRejectedValue(new Error('network'))
    renderDayView()
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load day.')
  })

  it('renders timed items in the unified timeline', async () => {
    const item = makePlanItem({ id: 'i1', title: 'Morning run', start_time: '07:00:00' })
    vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
    renderDayView()
    await waitFor(() => expect(screen.getByText('Timeline')).toBeInTheDocument())
    expect(screen.getByText('Morning run')).toBeInTheDocument()
    expect(screen.getByText('07:00')).toBeInTheDocument()
  })

  it('renders untimed items in the same timeline', async () => {
    const item = makePlanItem({ id: 'i2', title: 'Buy souvenirs' })
    vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
    renderDayView()
    await waitFor(() => {
      const planSlot = document.querySelector('[data-slot="planning"]')
      expect(planSlot).not.toBeNull()
      expect(within(planSlot as HTMLElement).getByText('Timeline')).toBeInTheDocument()
    })
    expect(screen.getByText('Buy souvenirs')).toBeInTheDocument()
  })

  it('sorts timed items by clock and keeps an untimed item between them', async () => {
    // Server returns them out of order with the untimed item in the middle slot;
    // the timeline must read Morning (09:00), then the untimed Lunch, then
    // Afternoon (15:00) — timed sorted by time, untimed holding its position.
    const afternoon = makePlanItem({ id: 'a', title: 'Afternoon museum', start_time: '15:00:00' })
    const lunch = makePlanItem({ id: 'l', title: 'Lunch somewhere' })
    const morning = makePlanItem({ id: 'm', title: 'Morning tour', start_time: '09:00:00' })
    vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [afternoon, lunch, morning] }))
    renderDayView()
    await waitFor(() => expect(screen.getByText('Timeline')).toBeInTheDocument())

    const planSlot = document.querySelector('[data-slot="planning"]') as HTMLElement
    const titles = [...planSlot.querySelectorAll('.plan-item-title, .plan-item-name')].map((n) =>
      (n.textContent ?? '').trim(),
    )
    // Fall back to reading item rows if the title class differs.
    const order =
      titles.length >= 3
        ? titles
        : [...planSlot.querySelectorAll('li.plan-item')].map((li) => (li.textContent ?? '').trim())
    const idx = (t: string) => order.findIndex((s) => s.includes(t))
    expect(idx('Morning tour')).toBeGreaterThanOrEqual(0)
    expect(idx('Morning tour')).toBeLessThan(idx('Lunch somewhere'))
    expect(idx('Lunch somewhere')).toBeLessThan(idx('Afternoon museum'))
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
    // A planned item marked done shows in both Plan and What happened, so it
    // renders twice — each with the Done badge.
    await waitFor(() => expect(screen.getAllByText('Done task').length).toBe(2))
    expect(document.querySelector('.plan-item-status-badge')).toHaveTextContent('Done')
    expect(screen.getAllByLabelText(/Done task — Done/)).toHaveLength(2)
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

  describe('plan vs what happened', () => {
    it('keeps a planned-done item in both Plan and What happened, but a logged one only in What happened', async () => {
      // Planned then done: stays in the plan (to compare) and shows under what
      // happened. Logged after the fact (unplanned): only under what happened.
      const planDone = makePlanItem({ id: 'p1', title: 'Belém Tower', status: 'done' })
      const logged = makePlanItem({
        id: 'd1',
        title: 'Sunset kayak',
        status: 'done',
        unplanned: true,
      })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [planDone, logged] }))
      renderDayView()
      await waitFor(() => expect(screen.getByText('Sunset kayak')).toBeInTheDocument())

      const planTimeline = screen.getByRole('region', { name: 'Day timeline' })
      // The planned item is in the plan; the logged one is not.
      expect(within(planTimeline).getByText('Belém Tower')).toBeInTheDocument()
      expect(within(planTimeline).queryByText('Sunset kayak')).not.toBeInTheDocument()
      // Both show under what happened, so each done title appears there.
      expect(screen.getAllByText('Belém Tower')).toHaveLength(2)
      expect(screen.getByText('What happened')).toBeInTheDocument()
    })

    it('hides the plan when "Hide plan" is clicked', async () => {
      const planned = makePlanItem({ id: 'p1', title: 'Belém Tower', status: 'planned' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [planned] }))
      const user = userEvent.setup()
      renderDayView()
      await waitFor(() => expect(screen.getByText('Belém Tower')).toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: 'Hide plan' }))
      expect(screen.queryByText('Belém Tower')).not.toBeInTheDocument()
      expect(screen.getByText(/Plan hidden/)).toBeInTheDocument()
    })

    it('logs a done item via "Log something you did"', async () => {
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
      vi.mocked(api.createPlanItem).mockResolvedValue(
        makePlanItem({ id: 'log1', title: 'Gelato run', status: 'planned' }),
      )
      vi.mocked(api.setPlanItemStatus).mockResolvedValue(
        makePlanItem({ id: 'log1', title: 'Gelato run', status: 'done' }),
      )
      const user = userEvent.setup()
      renderDayView()
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Log something you did' })).toBeInTheDocument(),
      )

      await user.click(screen.getByRole('button', { name: 'Log something you did' }))
      // Two forms are visible now (plan quick-add + log); scope to the one with
      // the "Log it" submit.
      const form = screen.getByRole('button', { name: 'Log it' }).closest('form') as HTMLElement
      await user.type(within(form).getByLabelText('Title'), 'Gelato run')
      await user.click(within(form).getByRole('button', { name: 'Log it' }))

      await waitFor(() =>
        expect(api.setPlanItemStatus).toHaveBeenCalledWith('trip-1', 'log1', 'done'),
      )
      // The create carried a client id (so set-status targets the same row) and
      // the unplanned flag (so it stays out of the Plan list).
      expect(api.createPlanItem).toHaveBeenCalledWith(
        'trip-1',
        expect.objectContaining({ title: 'Gelato run', id: expect.any(String), unplanned: true }),
      )
    })
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

    it('offers a kind picker defaulting to Activity', async () => {
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
      renderDayView()
      await waitFor(() => expect(screen.getByLabelText('Title')).toBeInTheDocument())

      const picker = screen.getByRole('group', { name: 'Kind' })
      for (const label of ['Activity', 'Transport', 'Food', 'Note']) {
        expect(within(picker).getByRole('button', { name: new RegExp(label) })).toBeInTheDocument()
      }
      expect(within(picker).getByRole('button', { name: /Activity/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    })

    it('transport kind shows from/to and sends kind + auto-suggested category', async () => {
      const user = userEvent.setup()
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
      vi.mocked(api.createPlanItem).mockResolvedValue(
        makePlanItem({ id: 'tp', title: 'Train', kind: 'transport' }),
      )

      renderDayView()
      await waitFor(() => expect(screen.getByLabelText('Title')).toBeInTheDocument())

      // Scope to the plan-item form — the day's budget editor also renders a
      // "Transport" category control, so screen-wide queries are ambiguous.
      const form = screen.getByRole('group', { name: 'Kind' }).closest('form') as HTMLElement
      await user.click(within(form).getByRole('button', { name: /Transport/ }))
      // Location is replaced by From / To for a transport leg.
      expect(within(form).queryByLabelText('Location')).not.toBeInTheDocument()
      await user.type(within(form).getByLabelText('Title'), 'Train to Porto')
      await user.type(within(form).getByLabelText('From'), 'Lisbon')
      await user.type(within(form).getByLabelText('To'), 'Porto')
      await user.click(within(form).getByRole('button', { name: 'Add' }))

      await waitFor(() => expect(api.createPlanItem).toHaveBeenCalled())
      expect(api.createPlanItem).toHaveBeenCalledWith(
        'trip-1',
        expect.objectContaining({
          kind: 'transport',
          type: 'Transport', // auto-suggested budget category, decoupled from kind
          origin: 'Lisbon',
          destination: 'Porto',
        }),
      )
    })

    it('sends a typed note with the create payload', async () => {
      const user = userEvent.setup()
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
      vi.mocked(api.createPlanItem).mockResolvedValue(makePlanItem({ id: 'n1', title: 'Kayak' }))

      renderDayView()
      await waitFor(() => expect(screen.getByLabelText('Title')).toBeInTheDocument())

      const form = screen.getByRole('group', { name: 'Kind' }).closest('form') as HTMLElement
      await user.type(within(form).getByLabelText('Title'), 'Kayak')
      // Note lives behind the "More details" disclosure.
      await user.click(within(form).getByRole('button', { name: /More details/ }))
      await user.type(within(form).getByLabelText('Note'), 'Best two hours of the trip')
      await user.click(within(form).getByRole('button', { name: 'Add' }))

      await waitFor(() => expect(api.createPlanItem).toHaveBeenCalled())
      expect(api.createPlanItem).toHaveBeenCalledWith(
        'trip-1',
        expect.objectContaining({ note: 'Best two hours of the trip' }),
      )
    })

    it('note kind hides location and the budget category', async () => {
      const user = userEvent.setup()
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
      renderDayView()
      await waitFor(() => expect(screen.getByLabelText('Title')).toBeInTheDocument())

      const form = screen.getByRole('group', { name: 'Kind' }).closest('form') as HTMLElement
      await user.click(within(form).getByRole('button', { name: /Note/ }))
      // A note is a plain reminder: no place, and no budget category.
      expect(within(form).queryByLabelText('Location')).not.toBeInTheDocument()
      expect(within(form).queryByLabelText('Category')).not.toBeInTheDocument()
    })

    it('switching to note drops a stale cost so it never hits the budget', async () => {
      const user = userEvent.setup()
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
      vi.mocked(api.createPlanItem).mockResolvedValue(makePlanItem({ id: 'n1', kind: 'note' }))
      renderDayView()
      await waitFor(() => expect(screen.getByLabelText('Title')).toBeInTheDocument())

      const form = screen.getByRole('group', { name: 'Kind' }).closest('form') as HTMLElement
      await user.type(within(form).getByLabelText('Title'), 'Buy port wine')
      // Enter a cost as an activity, then switch the kind to note (hides cost).
      await user.click(within(form).getByRole('button', { name: /details/i }))
      await user.type(within(form).getByLabelText('Cost'), '50')
      await user.click(within(form).getByRole('button', { name: /Note/ }))
      await user.click(within(form).getByRole('button', { name: 'Add' }))

      await waitFor(() => expect(api.createPlanItem).toHaveBeenCalled())
      const sent = vi.mocked(api.createPlanItem).mock.calls[0][1]
      expect(sent).toMatchObject({ kind: 'note', cost: null, type: null })
    })

    it('adds a located stop to the map immediately (no reload)', async () => {
      const user = userEvent.setup()
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
      const located = makePlanItem({ id: 'new-loc', title: 'Kiyomizu-dera', location: 'Kyoto' })
      vi.mocked(api.createPlanItem).mockResolvedValue(located)

      renderDayView()
      await waitFor(() => expect(screen.getByLabelText('Title')).toBeInTheDocument())
      // No map pins before adding.
      expect(screen.queryByRole('button', { name: /^Pin 1:/ })).not.toBeInTheDocument()

      await user.type(screen.getByLabelText('Title'), 'Kiyomizu-dera')
      await user.click(screen.getByRole('button', { name: 'Add' }))

      // The map's pin legend reflects the new located stop without a reload,
      // proving DayView's lifted plan-items state feeds the map live.
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Pin 1: Kiyomizu-dera' })).toBeInTheDocument(),
      )
    })

    it('queues the add offline and shows a temp item without calling the server', async () => {
      const user = userEvent.setup()
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
      // Simulate an offline browser so useIsOnline reports offline at mount.
      const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

      renderDayView()
      await waitFor(() => expect(screen.getByLabelText('Title')).toBeInTheDocument())

      await user.type(screen.getByLabelText('Title'), 'Offline activity')
      await user.click(screen.getByRole('button', { name: 'Add' }))

      // The temp item appears immediately (from the queued write, not the server).
      await waitFor(() => expect(screen.getByText('Offline activity')).toBeInTheDocument())
      expect(enqueue).toHaveBeenCalledWith(
        'createPlanItem',
        expect.objectContaining({
          tripId: 'trip-1',
          input: expect.objectContaining({ title: 'Offline activity', day_id: 'day-1' }),
        }),
      )
      expect(api.createPlanItem).not.toHaveBeenCalled()

      onLine.mockRestore()
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

    it('shows Location without expanding, and reveals extra fields on More details', async () => {
      const user = userEvent.setup()
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
      renderDayView()
      await waitFor(() => expect(screen.getByLabelText('Title')).toBeInTheDocument())

      // Location is always visible in the composer — no click needed.
      expect(screen.getByLabelText('Location')).toBeInTheDocument()
      // Extra fields stay behind the disclosure.
      expect(screen.queryByLabelText('Start time')).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'More details' }))
      expect(screen.getByLabelText('Start time')).toBeInTheDocument()
    })

    it('confirms a typed location resolves on the map', async () => {
      const user = userEvent.setup()
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
      vi.mocked(api.geocodeLocation).mockResolvedValue({ lat: 48.86, lng: 2.34 })
      renderDayView()
      await waitFor(() => expect(screen.getByLabelText('Title')).toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: 'More details' }))
      await user.type(screen.getByLabelText('Location'), 'Louvre, Paris')

      await waitFor(() => expect(screen.getByText(/will show on the map/i)).toBeInTheDocument())
      expect(api.geocodeLocation).toHaveBeenCalledWith('Louvre, Paris', expect.anything())
    })

    it('warns when a typed location cannot be placed', async () => {
      const user = userEvent.setup()
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
      vi.mocked(api.geocodeLocation).mockResolvedValue(null)
      renderDayView()
      await waitFor(() => expect(screen.getByLabelText('Title')).toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: 'More details' }))
      await user.type(screen.getByLabelText('Location'), 'asdfqwer')

      await waitFor(() => expect(screen.getByText(/couldn.t place this/i)).toBeInTheDocument())
    })

    it('shows place suggestions and fills the field when one is chosen', async () => {
      const user = userEvent.setup()
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
      vi.mocked(api.geocodeLocation).mockResolvedValue({ lat: 35, lng: 135 })
      vi.mocked(api.fetchAutocomplete).mockResolvedValue([
        { description: 'Fushimi Inari Taisha, Kyoto, Japan', place_id: 'p1' },
        { description: 'Fushimi Ward, Kyoto, Japan', place_id: 'p2' },
      ])
      renderDayView()
      await waitFor(() => expect(screen.getByLabelText('Title')).toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: 'More details' }))
      await user.type(screen.getByLabelText('Location'), 'Fushimi')

      const option = await screen.findByRole('option', {
        name: 'Fushimi Inari Taisha, Kyoto, Japan',
      })
      await user.click(option)

      expect(screen.getByLabelText('Location')).toHaveValue('Fushimi Inari Taisha, Kyoto, Japan')
      // Dropdown closes after selection.
      await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
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

    it('preserves kind when editing an item (does not reset to activity)', async () => {
      const user = userEvent.setup()
      // A transport item edited via the form must round-trip its kind, otherwise
      // the backend defaults an omitted kind back to 'activity' (M12.1 S1).
      const item = makePlanItem({ title: 'Train to Porto', kind: 'transport' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
      vi.mocked(api.updatePlanItem).mockResolvedValue(
        makePlanItem({ title: 'Train to Braga', kind: 'transport' }),
      )

      renderDayView()
      await waitFor(() => expect(screen.getByText('Train to Porto')).toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: /Edit Train to Porto/ }))
      const editingLi = document.querySelector('.plan-item--editing')!
      const input = within(editingLi as HTMLElement).getByLabelText('Title')
      await user.clear(input)
      await user.type(input, 'Train to Braga')
      await user.click(within(editingLi as HTMLElement).getByRole('button', { name: 'Save' }))

      await waitFor(() => expect(screen.getByText('Train to Braga')).toBeInTheDocument())
      expect(api.updatePlanItem).toHaveBeenCalledWith(
        'trip-1',
        'item-1',
        expect.objectContaining({ kind: 'transport' }),
      )
    })

    it('preserves transport fields when editing (does not wipe origin/dest/arrival)', async () => {
      const user = userEvent.setup()
      // Editing is a full replacement server-side, so the form must round-trip
      // origin/destination/arrive_time or they'd be cleared on any edit (M12.1 S2).
      const item = makePlanItem({
        title: 'Train to Porto',
        kind: 'transport',
        origin: 'Lisboa Oriente',
        destination: 'Porto Campanhã',
        arrive_time: '11:20',
      })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
      vi.mocked(api.updatePlanItem).mockResolvedValue(makePlanItem({ title: 'Train to Braga' }))

      renderDayView()
      await waitFor(() => expect(screen.getByText('Train to Porto')).toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: /Edit Train to Porto/ }))
      const editingLi = document.querySelector('.plan-item--editing')!
      const input = within(editingLi as HTMLElement).getByLabelText('Title')
      await user.clear(input)
      await user.type(input, 'Train to Braga')
      await user.click(within(editingLi as HTMLElement).getByRole('button', { name: 'Save' }))

      await waitFor(() => expect(screen.getByText('Train to Braga')).toBeInTheDocument())
      expect(api.updatePlanItem).toHaveBeenCalledWith(
        'trip-1',
        'item-1',
        expect.objectContaining({
          origin: 'Lisboa Oriente',
          destination: 'Porto Campanhã',
          arrive_time: '11:20',
        }),
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

    it('splitting on save reshapes the item into part 1 and creates the rest', async () => {
      const user = userEvent.setup()
      // Item already has a cost, so "More details" opens and the split toggle shows.
      const item = makePlanItem({ title: 'Flight', cost: 10 })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
      vi.mocked(api.updatePlanItem).mockResolvedValue(
        makePlanItem({ id: 'item-1', title: 'Flight (part 1/2)', cost: 5 }),
      )
      vi.mocked(api.createPlanItem).mockResolvedValue(
        makePlanItem({ id: 'item-2', title: 'Flight (part 2/2)', cost: 5 }),
      )

      renderDayView()
      await waitFor(() => expect(screen.getByText('Flight')).toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: /Edit Flight/ }))
      const editingLi = document.querySelector('.plan-item--editing')!
      // Enable the split (defaults to 2 parts) and save.
      await user.click(
        within(editingLi as HTMLElement).getByRole('checkbox', {
          name: 'Split this cost into several',
        }),
      )
      await user.click(within(editingLi as HTMLElement).getByRole('button', { name: 'Save' }))

      // Part 1 reuses the existing item (same id); part 2 is a new sibling. The
      // €10 is divided to €5 + €5 (Budget total unchanged).
      await waitFor(() =>
        expect(api.updatePlanItem).toHaveBeenCalledWith(
          'trip-1',
          'item-1',
          expect.objectContaining({ title: 'Flight (part 1/2)', cost: 5 }),
        ),
      )
      expect(api.createPlanItem).toHaveBeenCalledWith(
        'trip-1',
        expect.objectContaining({ title: 'Flight (part 2/2)', cost: 5 }),
      )
      await waitFor(() => expect(screen.getByText('Flight (part 2/2)')).toBeInTheDocument())
    })
  })

  describe('mobile interactions (S5)', () => {
    function setMobile(mobile: boolean) {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: (query: string) => ({
          matches: mobile && query === '(max-width: 640px)',
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }),
      })
    }

    afterEach(() => setMobile(false))

    it('shows only Day and Map facets, with plan + journal + budget merged into Day', async () => {
      setMobile(true)
      const user = userEvent.setup()
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
      renderDayView()
      await waitFor(() =>
        expect(screen.getByRole('tablist', { name: 'Trip sections' })).toBeInTheDocument(),
      )
      // The four old facets collapse to two — Plan/Journal/Budget are no longer
      // their own tabs.
      expect(screen.getByRole('tab', { name: 'Day' })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Map' })).toBeInTheDocument()
      expect(screen.queryByRole('tab', { name: 'Plan' })).not.toBeInTheDocument()
      expect(screen.queryByRole('tab', { name: 'Journal' })).not.toBeInTheDocument()
      expect(screen.queryByRole('tab', { name: 'Budget' })).not.toBeInTheDocument()

      // The Day facet (default) stacks plan + journal + the budget strip together.
      expect(screen.getByRole('region', { name: 'Planning' })).toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Journal' })).toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Budget' })).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Map' })).not.toBeInTheDocument()

      // Switching to Map reveals it and hides the Day scroll.
      await user.click(screen.getByRole('tab', { name: 'Map' }))
      expect(screen.getByRole('region', { name: 'Map' })).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Planning' })).not.toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Journal' })).not.toBeInTheDocument()
    })

    it('shows the day budget (spent + upcoming) with a link to the Budget tab', async () => {
      setMobile(false)
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
      vi.mocked(api.fetchBudgetRollup).mockResolvedValue({
        trip_total: 0,
        planned_trip_total: 0,
        estimated_trip_total: 0,
        by_category: {},
        planned_by_category: {},
        estimated_by_category: {},
        by_day: { 'day-1': 48 },
        planned_by_day: {},
        estimated_by_day: { 'day-1': 20 },
        by_day_category: {},
      } as unknown as api.BudgetRollup)
      renderDayView()

      // The "Open Budget" link only exists once the loaded strip mounts (the
      // placeholder has just a title), so wait on it before asserting figures.
      const link = await screen.findByRole('link', { name: /Open Budget/ })
      expect(link).toHaveAttribute('href', '/trips/trip-1/budget')
      // DayRollup shows the day's spend and its upcoming (not-yet-done) estimate.
      expect(await screen.findByText(/48/)).toBeInTheDocument()
      expect(screen.getByText(/20.*upcoming/i)).toBeInTheDocument()
    })

    it('sets a day extra on a category from the day budget', async () => {
      setMobile(false)
      const user = userEvent.setup()
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
      vi.mocked(api.setDayBudgetLine).mockResolvedValue({
        id: 'bl1',
        trip_id: 'trip-1',
        day_id: 'day-1',
        category: 'Activities',
        scope: 'day',
        planned_amount: 30,
        actual_amount: 0,
      })
      renderDayView()

      await user.click(await screen.findByRole('button', { name: /Add extra to a category/ }))
      // The amount is a button until clicked; then it becomes a labelled input.
      await user.click(await screen.findByRole('button', { name: /Extra budget for Activities/ }))
      const input = await screen.findByLabelText('Extra budget for Activities')
      await user.type(input, '30')
      await user.tab() // blur commits

      await waitFor(() =>
        expect(api.setDayBudgetLine).toHaveBeenCalledWith('trip-1', 'day-1', {
          category: 'Activities',
          planned_amount: 30,
        }),
      )
    })

    it('does not render facet tabs on desktop (combined grid instead)', async () => {
      setMobile(false)
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
      renderDayView()
      await waitFor(() =>
        expect(screen.getByRole('region', { name: 'Planning' })).toBeInTheDocument(),
      )
      // Desktop shows all facets together, no segmented control.
      expect(screen.queryByRole('tablist', { name: 'Trip sections' })).not.toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Map' })).toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Journal' })).toBeInTheDocument()
    })

    it('renders a FAB button on mobile instead of the inline quick-add form', async () => {
      setMobile(true)
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
      renderDayView()
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Add activity' })).toBeInTheDocument(),
      )
      // The inline title input should NOT be visible (it's inside a hidden form on mobile)
      expect(screen.queryByLabelText('Title')).not.toBeInTheDocument()
    })

    it('FAB opens a bottom sheet with the add form', async () => {
      setMobile(true)
      const user = userEvent.setup()
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
      renderDayView()
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Add activity' })).toBeInTheDocument(),
      )

      await user.click(screen.getByRole('button', { name: 'Add activity' }))
      expect(screen.getByRole('dialog', { name: 'Add to plan' })).toBeInTheDocument()
      expect(screen.getByLabelText('Title')).toBeInTheDocument()
    })

    it('adding via FAB sheet closes the sheet on success', async () => {
      setMobile(true)
      const user = userEvent.setup()
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
      vi.mocked(api.createPlanItem).mockResolvedValue(makePlanItem({ id: 'n1', title: 'New act' }))
      renderDayView()
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Add activity' })).toBeInTheDocument(),
      )

      await user.click(screen.getByRole('button', { name: 'Add activity' }))
      await user.type(screen.getByLabelText('Title'), 'New act')
      await user.click(screen.getByRole('button', { name: 'Add to plan' }))

      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Add to plan' })).not.toBeInTheDocument(),
      )
      expect(screen.getByText('New act')).toBeInTheDocument()
    })

    it('editing on mobile opens a bottom sheet', async () => {
      setMobile(true)
      const user = userEvent.setup()
      const item = makePlanItem({ title: 'Visit museum' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
      renderDayView()
      await waitFor(() => expect(screen.getByText('Visit museum')).toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: /Edit Visit museum/ }))
      expect(screen.getByRole('dialog', { name: /Edit Visit museum/ })).toBeInTheDocument()
      expect(screen.getByLabelText('Title')).toBeInTheDocument()
    })

    it('bottom sheet has role=dialog and aria-modal on the inner panel (M09.5 a11y)', async () => {
      setMobile(true)
      const user = userEvent.setup()
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
      renderDayView()
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Add activity' })).toBeInTheDocument(),
      )

      await user.click(screen.getByRole('button', { name: 'Add activity' }))
      const dialog = screen.getByRole('dialog', { name: 'Add to plan' })
      expect(dialog).toHaveAttribute('aria-modal', 'true')
    })

    it('Escape closes the mobile add sheet (M09.5 a11y)', async () => {
      setMobile(true)
      const user = userEvent.setup()
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
      renderDayView()
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Add activity' })).toBeInTheDocument(),
      )

      await user.click(screen.getByRole('button', { name: 'Add activity' }))
      expect(screen.getByRole('dialog', { name: 'Add to plan' })).toBeInTheDocument()

      await user.keyboard('{Escape}')
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Add to plan' })).not.toBeInTheDocument(),
      )
    })

    it('renders touch reorder buttons on mobile for untimed items', async () => {
      setMobile(true)
      const items = [
        makePlanItem({ id: 'i1', title: 'First', sort_order: 0 }),
        makePlanItem({ id: 'i2', title: 'Second', sort_order: 1 }),
      ]
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: items }))
      renderDayView()
      await waitFor(() => expect(screen.getByText('First')).toBeInTheDocument())
      expect(screen.getByRole('button', { name: /Move First down/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Move Second up/ })).toBeInTheDocument()
    })

    it('touch reorder up/down calls reorderPlanItems', async () => {
      setMobile(true)
      const user = userEvent.setup()
      const items = [
        makePlanItem({ id: 'i1', title: 'First', sort_order: 0 }),
        makePlanItem({ id: 'i2', title: 'Second', sort_order: 1 }),
      ]
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: items }))
      vi.mocked(api.reorderPlanItems).mockResolvedValue()
      renderDayView()
      await waitFor(() => expect(screen.getByText('Second')).toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: /Move Second up/ }))

      await waitFor(() =>
        expect(api.reorderPlanItems).toHaveBeenCalledWith('trip-1', 'day-1', ['i2', 'i1']),
      )
    })

    it('reordering the plan keeps logged items in "What happened"', async () => {
      setMobile(true)
      const user = userEvent.setup()
      const items = [
        makePlanItem({ id: 'i1', title: 'First', sort_order: 0 }),
        makePlanItem({ id: 'i2', title: 'Second', sort_order: 1 }),
        // Logged after the fact — not in the plan timeline, so a reorder must not
        // drop it from state (regression: it was dropped on merge-back).
        makePlanItem({
          id: 'd1',
          title: 'Kayak logged',
          status: 'done',
          unplanned: true,
          sort_order: 2,
        }),
      ]
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: items }))
      vi.mocked(api.reorderPlanItems).mockResolvedValue()
      renderDayView()
      await waitFor(() => expect(screen.getByText('Kayak logged')).toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: /Move Second up/ }))

      // The reorder only sends the two planned items; the logged one is untouched.
      await waitFor(() =>
        expect(api.reorderPlanItems).toHaveBeenCalledWith('trip-1', 'day-1', ['i2', 'i1']),
      )
      expect(screen.getByText('Kayak logged')).toBeInTheDocument()
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

      await waitFor(() =>
        expect(api.setPlanItemStatus).toHaveBeenCalledWith('trip-1', 'item-1', 'done'),
      )
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
      expect(
        screen.getByRole('button', { name: /Move Visit museum to backlog/ }),
      ).toBeInTheDocument()
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

    it('clicking the bin then confirming deletes the item and removes it', async () => {
      const user = userEvent.setup()
      const item = makePlanItem({ title: 'Visit museum' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
      vi.mocked(api.deletePlanItem).mockResolvedValue(undefined)

      renderDayView()
      await waitFor(() => expect(screen.getByText('Visit museum')).toBeInTheDocument())

      // First click only reveals the confirm — it must not delete yet.
      await user.click(screen.getByRole('button', { name: /Delete Visit museum/ }))
      expect(api.deletePlanItem).not.toHaveBeenCalled()

      await user.click(screen.getByRole('button', { name: /Confirm delete Visit museum/ }))

      await waitFor(() => expect(screen.queryByText('Visit museum')).not.toBeInTheDocument())
      expect(api.deletePlanItem).toHaveBeenCalledWith('trip-1', 'item-1')
    })

    it('cancelling the delete confirm keeps the item', async () => {
      const user = userEvent.setup()
      const item = makePlanItem({ title: 'Visit museum' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))

      renderDayView()
      await waitFor(() => expect(screen.getByText('Visit museum')).toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: /Delete Visit museum/ }))
      await user.click(screen.getByRole('button', { name: /Cancel delete/ }))

      expect(api.deletePlanItem).not.toHaveBeenCalled()
      expect(screen.getByText('Visit museum')).toBeInTheDocument()
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

  describe('auto-save', () => {
    beforeEach(() => {
      // shouldAdvanceTime lets real-time async (waitFor, fetchDay mocks) still
      // work while allowing manual fast-forward for the debounce timer.
      vi.useFakeTimers({ shouldAdvanceTime: true })
    })

    it('does not trigger a save immediately when the edit form opens', async () => {
      const user = userEvent.setup()
      const item = makePlanItem({ title: 'Visit museum' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
      renderDayView()
      await waitFor(() => expect(screen.getByText('Visit museum')).toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: /Edit Visit museum/ }))
      vi.advanceTimersByTime(1000)

      expect(api.updatePlanItem).not.toHaveBeenCalled()
    })

    it('auto-saves 800 ms after the last keystroke', async () => {
      const user = userEvent.setup()
      const item = makePlanItem({ title: 'Visit museum' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
      const updated = makePlanItem({ title: 'Visit museum updated' })
      vi.mocked(api.updatePlanItem).mockResolvedValue(updated)

      renderDayView()
      await waitFor(() => expect(screen.getByText('Visit museum')).toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: /Edit Visit museum/ }))
      const editingLi = document.querySelector('.plan-item--editing')!
      const input = within(editingLi as HTMLElement).getByLabelText('Title')
      await user.type(input, ' updated')

      // No save yet — debounce hasn't fired.
      expect(api.updatePlanItem).not.toHaveBeenCalled()

      // Advance past the 800 ms debounce window.
      await vi.runAllTimersAsync()

      await waitFor(() => expect(api.updatePlanItem).toHaveBeenCalledTimes(1))
      expect(api.updatePlanItem).toHaveBeenCalledWith(
        'trip-1',
        'item-1',
        expect.objectContaining({ title: 'Visit museum updated' }),
      )
    })

    it('coalesces rapid edits into a single save', async () => {
      const user = userEvent.setup()
      const item = makePlanItem({ title: 'Visit' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
      vi.mocked(api.updatePlanItem).mockResolvedValue(makePlanItem({ title: 'Visit museum' }))

      renderDayView()
      await waitFor(() => expect(screen.getByText('Visit')).toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: /Edit Visit/ }))
      const editingLi = document.querySelector('.plan-item--editing')!
      const input = within(editingLi as HTMLElement).getByLabelText('Title')

      // Type several characters quickly; each keystroke resets the timer.
      await user.type(input, ' museum')

      // Advance past the debounce window and flush all pending promises.
      await act(async () => {
        vi.advanceTimersByTime(1000)
      })

      expect(api.updatePlanItem).toHaveBeenCalledTimes(1)
    })

    it('shows Saving… during the save and Saved on success', async () => {
      let resolveSave!: (v: api.PlanItem) => void
      vi.mocked(api.updatePlanItem).mockReturnValue(
        new Promise<api.PlanItem>((resolve) => {
          resolveSave = resolve
        }),
      )
      const user = userEvent.setup()
      const item = makePlanItem({ title: 'Visit museum' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))

      renderDayView()
      await waitFor(() => expect(screen.getByText('Visit museum')).toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: /Edit Visit museum/ }))
      const editingLi = document.querySelector('.plan-item--editing')!
      await user.type(within(editingLi as HTMLElement).getByLabelText('Title'), ' extra')

      // Fire the debounce and flush microtasks so the save starts.
      await act(async () => {
        vi.advanceTimersByTime(1000)
      })

      expect(document.querySelector('.plan-item-save-status--saving')).toBeInTheDocument()
      expect(document.querySelector('.plan-item-save-status')!.textContent).toBe('Saving…')

      // Resolve the save and check the "Saved" state.
      await act(async () => {
        resolveSave(makePlanItem({ title: 'Visit museum extra' }))
      })

      expect(document.querySelector('.plan-item-save-status--saved')).toBeInTheDocument()
      expect(document.querySelector('.plan-item-save-status')!.textContent).toBe('Saved')
    })

    it('shows error and retry button when save fails', async () => {
      vi.mocked(api.updatePlanItem).mockRejectedValue(new Error('network'))
      const user = userEvent.setup()
      const item = makePlanItem({ title: 'Visit museum' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))

      renderDayView()
      await waitFor(() => expect(screen.getByText('Visit museum')).toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: /Edit Visit museum/ }))
      const editingLi = document.querySelector('.plan-item--editing')!
      await user.type(within(editingLi as HTMLElement).getByLabelText('Title'), ' extra')

      await act(async () => {
        vi.advanceTimersByTime(1000)
      })

      expect(document.querySelector('.plan-item-save-status--error')).toBeInTheDocument()
      expect(
        within(editingLi as HTMLElement).getByRole('button', { name: 'Retry' }),
      ).toBeInTheDocument()
    })

    it('retry button re-attempts the save', async () => {
      vi.mocked(api.updatePlanItem)
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValue(makePlanItem({ title: 'Visit museum extra' }))

      const user = userEvent.setup()
      const item = makePlanItem({ title: 'Visit museum' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))

      renderDayView()
      await waitFor(() => expect(screen.getByText('Visit museum')).toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: /Edit Visit museum/ }))
      const editingLi = document.querySelector('.plan-item--editing')!
      await user.type(within(editingLi as HTMLElement).getByLabelText('Title'), ' extra')

      await act(async () => {
        vi.advanceTimersByTime(1000)
      })

      expect(
        within(editingLi as HTMLElement).getByRole('button', { name: 'Retry' }),
      ).toBeInTheDocument()

      await user.click(within(editingLi as HTMLElement).getByRole('button', { name: 'Retry' }))

      await waitFor(() =>
        expect(document.querySelector('.plan-item-save-status--saved')).toBeInTheDocument(),
      )
    })
  })

  describe('pin↔item correlation (M07.4 S2)', () => {
    it('plan item with location shows a numbered pin badge', async () => {
      const item = makePlanItem({ id: 'i1', title: 'Eiffel Tower', location: 'Paris' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
      renderDayView()
      await waitFor(() => expect(screen.getByText('Eiffel Tower')).toBeInTheDocument())
      expect(screen.getByRole('button', { name: /Map pin 1 for Eiffel Tower/ })).toBeInTheDocument()
    })

    it('plan item without location has no pin badge', async () => {
      const item = makePlanItem({ id: 'i1', title: 'No location item' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
      renderDayView()
      await waitFor(() => expect(screen.getByText('No location item')).toBeInTheDocument())
      expect(
        screen.queryByRole('button', { name: /Map pin \d+ for No location item/ }),
      ).not.toBeInTheDocument()
    })

    it('clicking a pin badge selects the item (adds --selected class)', async () => {
      const user = userEvent.setup()
      const item = makePlanItem({ id: 'i1', title: 'Eiffel Tower', location: 'Paris' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
      renderDayView()
      await waitFor(() => expect(screen.getByText('Eiffel Tower')).toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: /Map pin 1 for Eiffel Tower/ }))

      const itemLi = screen.getByLabelText('Eiffel Tower').closest('li')
      expect(itemLi).toHaveClass('plan-item--selected')
    })

    it('clicking an already-selected pin badge deselects the item', async () => {
      const user = userEvent.setup()
      const item = makePlanItem({ id: 'i1', title: 'Eiffel Tower', location: 'Paris' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
      renderDayView()
      await waitFor(() => expect(screen.getByText('Eiffel Tower')).toBeInTheDocument())

      const pinBtn = screen.getByRole('button', { name: /Map pin 1 for Eiffel Tower/ })
      await user.click(pinBtn)
      await user.click(pinBtn)

      const itemLi = screen.getByLabelText('Eiffel Tower').closest('li')
      expect(itemLi).not.toHaveClass('plan-item--selected')
    })

    it('selecting one item deselects the previous selection', async () => {
      const user = userEvent.setup()
      const items = [
        makePlanItem({ id: 'i1', title: 'Eiffel Tower', location: 'Paris', sort_order: 0 }),
        makePlanItem({ id: 'i2', title: 'Louvre', location: 'Louvre, Paris', sort_order: 1 }),
      ]
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: items }))
      renderDayView()
      await waitFor(() => expect(screen.getByText('Eiffel Tower')).toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: /Map pin 1 for Eiffel Tower/ }))
      await user.click(screen.getByRole('button', { name: /Map pin 2 for Louvre/ }))

      const eiffelLi = screen.getByLabelText('Eiffel Tower').closest('li')
      const louvreLi = screen.getByLabelText('Louvre').closest('li')
      expect(eiffelLi).not.toHaveClass('plan-item--selected')
      expect(louvreLi).toHaveClass('plan-item--selected')
    })

    it('two located items get sequential pin numbers (robust to reordering)', async () => {
      const items = [
        makePlanItem({ id: 'i1', title: 'Stop A', location: 'Loc A', sort_order: 0 }),
        makePlanItem({ id: 'i2', title: 'Stop B', location: 'Loc B', sort_order: 1 }),
      ]
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: items }))
      renderDayView()
      await waitFor(() => expect(screen.getByText('Stop A')).toBeInTheDocument())

      expect(screen.getByRole('button', { name: /Map pin 1 for Stop A/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Map pin 2 for Stop B/ })).toBeInTheDocument()
    })

    it('stay with location shows a numbered pin badge', async () => {
      const stay = makeStay({ id: 'stay-1', name: 'Hotel Paris', location: 'Paris' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ stays: [stay] }))
      renderDayView()
      await waitFor(() => expect(screen.getByText('Hotel Paris')).toBeInTheDocument())
      expect(screen.getByRole('button', { name: /Map pin 1 for Hotel Paris/ })).toBeInTheDocument()
    })

    it('location-less item alongside located item does not get a pin badge', async () => {
      const items = [
        makePlanItem({ id: 'i1', title: 'No location', sort_order: 0 }),
        makePlanItem({ id: 'i2', title: 'Located', location: 'Paris', sort_order: 1 }),
      ]
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: items }))
      renderDayView()
      await waitFor(() => expect(screen.getByText('No location')).toBeInTheDocument())

      expect(
        screen.queryByRole('button', { name: /Map pin \d+ for No location/ }),
      ).not.toBeInTheDocument()
      // Located item still gets pin 1 (location-less item is skipped in numbering)
      expect(screen.getByRole('button', { name: /Map pin 1 for Located/ })).toBeInTheDocument()
    })
  })
})

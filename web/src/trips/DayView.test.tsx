import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DayView } from './DayView'
import * as api from '../lib/api'
import type { Day, PlanItem, Stay, Trip } from '../lib/api'
import { enqueue } from '../lib/mutationQueue'
import { readCache, writeCache } from '../lib/resourceCache'
import { cacheKeys } from '../lib/cacheKeys'

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
    listCostEntries: vi.fn().mockResolvedValue([]),
    createPlanItem: vi.fn(),
    updatePlanItem: vi.fn(),
    setPlanItemStatus: vi.fn(),
    demotePlanItem: vi.fn(),
    deletePlanItem: vi.fn(),
    movePlanItem: vi.fn(),
    reorderPlanItems: vi.fn(),
    reorderPlanItemsActual: vi.fn(),
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

// renderDayJournal renders a day's journal as the Journal tab shows it
// (/trips/:tripId/journal/:date): photos, diary and what happened.
function renderDayJournal(date = '2026-06-01', tripId = 'trip-1') {
  return render(
    <MemoryRouter initialEntries={[`/trips/${tripId}/journal/${date}`]}>
      <Routes>
        <Route path="/trips/:tripId/journal/:date" element={<DayView variant="journal" />} />
      </Routes>
    </MemoryRouter>,
  )
}

// addBar focuses the day's pinned add bar (its kind chips, place and details
// appear on focus) and returns its form.
async function addBar(): Promise<HTMLElement> {
  const input = await screen.findByLabelText(/^Add to /)
  fireEvent.focus(input)
  return input.closest('form') as HTMLElement
}

// openDetails opens an item's Plan details sheet and returns the dialog.
async function openDetails(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.click(screen.getAllByRole('button', { name: `Edit ${title}` })[0])
  return screen.getByRole('dialog', { name: 'Plan details' })
}

// setPhone switches the day to its phone layout (Plan / Journal switch).
function setPhone(phone: boolean) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: phone ? 375 : 1024 })
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
  vi.mocked(api.listCostEntries).mockResolvedValue([])
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
  setPhone(false)
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
    // Date box + place heading (no place yet → "Day 1") + day position.
    expect(await screen.findByRole('heading', { level: 1, name: 'Day 1' })).toBeInTheDocument()
    expect(screen.getByText('Day 1 / 3')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /all days/i })).toHaveAttribute(
      'href',
      '/trips/trip-1/plan',
    )
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
    await screen.findByRole('list', { name: 'Day timeline' })
    expect(screen.getByText('Morning run')).toBeInTheDocument()
    expect(screen.getByText('07:00')).toBeInTheDocument()
  })

  it('renders untimed items in the same timeline', async () => {
    const item = makePlanItem({ id: 'i2', title: 'Buy souvenirs' })
    vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
    renderDayView()
    await screen.findByRole('list', { name: 'Day timeline' })
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
    await screen.findByRole('list', { name: 'Day timeline' })

    const planSlot = document.querySelector('[data-slot="planning"]') as HTMLElement
    const titles = [...planSlot.querySelectorAll('.plan-row-title')].map((n) =>
      (n.textContent ?? '').trim(),
    )
    // Fall back to reading item rows if the title class differs.
    const order =
      titles.length >= 3
        ? titles
        : [...planSlot.querySelectorAll('li.plan-row')].map((li) => (li.textContent ?? '').trim())
    const idx = (t: string) => order.findIndex((s) => s.includes(t))
    expect(idx('Morning tour')).toBeGreaterThanOrEqual(0)
    expect(idx('Morning tour')).toBeLessThan(idx('Lunch somewhere'))
    expect(idx('Lunch somewhere')).toBeLessThan(idx('Afternoon museum'))
  })

  it('renders the stay as a compact line', async () => {
    const stay = makeStay()
    vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ stays: [stay] }))
    renderDayView()
    const section = await screen.findByRole('region', { name: 'Accommodation' })
    expect(within(section).getByText('Hotel Paris')).toBeInTheDocument()
    expect(within(section).getByText('Night 1 of 2 · check in today')).toBeInTheDocument()
  })

  it('shows a done item ticked in the plan, and under what happened in the journal', async () => {
    const item = makePlanItem({ id: 'i4', title: 'Done task', status: 'done' })
    vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
    const { unmount } = renderDayView()
    await waitFor(() => expect(screen.getAllByLabelText(/Done task — Done/)).toHaveLength(1))
    const ticks = screen.getAllByRole('button', { name: 'Mark not done: Done task' })
    expect(ticks[0]).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('What happened')).not.toBeInTheDocument()
    unmount()

    renderDayJournal()
    await waitFor(() => expect(screen.getByText('What happened')).toBeInTheDocument())
    expect(screen.getAllByLabelText(/Done task — Done/)).toHaveLength(1)
  })

  it('tags skipped and cancelled items instead of offering a tick', async () => {
    const items = [
      makePlanItem({ id: 'i5', title: 'Skipped task', status: 'skipped', sort_order: 0 }),
      makePlanItem({ id: 'i6', title: 'Cancelled task', status: 'cancelled', sort_order: 1 }),
    ]
    vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: items }))
    renderDayView()
    await waitFor(() => expect(screen.getByText('Skipped task')).toBeInTheDocument())
    expect(screen.getByLabelText('Skipped task — Skipped')).toHaveTextContent('Skipped')
    expect(screen.getByLabelText('Cancelled task — Cancelled')).toHaveTextContent('Cancelled')
    expect(
      screen.queryByRole('button', { name: /Mark done: Skipped task/ }),
    ).not.toBeInTheDocument()
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
      const { unmount } = renderDayView()
      await waitFor(() => expect(screen.getByText('Belém Tower')).toBeInTheDocument())

      const planTimeline = screen.getByRole('list', { name: 'Day timeline' })
      // The planned item is in the plan; the logged one is not.
      expect(within(planTimeline).getByText('Belém Tower')).toBeInTheDocument()
      expect(screen.queryByText('Sunset kayak')).not.toBeInTheDocument()
      unmount()

      // Both show under what happened in the day's journal.
      renderDayJournal()
      await waitFor(() => expect(screen.getByText('Sunset kayak')).toBeInTheDocument())
      expect(screen.getByText('Belém Tower')).toBeInTheDocument()
      expect(screen.getByText('What happened')).toBeInTheDocument()
    })

    it('logs a done item via “Something you didn’t plan”', async () => {
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
      vi.mocked(api.createPlanItem).mockResolvedValue(
        makePlanItem({ id: 'log1', title: 'Gelato run', status: 'planned' }),
      )
      vi.mocked(api.setPlanItemStatus).mockResolvedValue(
        makePlanItem({ id: 'log1', title: 'Gelato run', status: 'done' }),
      )
      const user = userEvent.setup()
      renderDayJournal()
      await user.click(await screen.findByRole('button', { name: /Something you didn’t plan/ }))
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

  it('renders notes when present', async () => {
    vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ notes: 'Arrive early' }))
    renderDayView()
    await waitFor(() => expect(screen.getByText('Arrive early')).toBeInTheDocument())
  })

  describe('quick add', () => {
    it('renders a single add bar whose details appear only once focused', async () => {
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
      renderDayView()
      const input = await screen.findByLabelText('Add to Monday')
      expect(input).toHaveAttribute('placeholder', 'Add a place, ferry, meal or note…')
      expect(screen.queryByRole('group', { name: 'Kind' })).not.toBeInTheDocument()
      fireEvent.focus(input)
      expect(screen.getByRole('group', { name: 'Kind' })).toBeInTheDocument()
    })

    it('adds a new item and shows it in the list', async () => {
      const user = userEvent.setup()
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
      const newItem = makePlanItem({ id: 'new-1', title: 'New activity' })
      vi.mocked(api.createPlanItem).mockResolvedValue(newItem)

      renderDayView()
      const bar = await addBar()

      await user.type(within(bar).getByLabelText(/^Add to /), 'New activity')
      await user.click(within(bar).getByRole('button', { name: 'Add' }))

      await waitFor(() => expect(screen.getByText('New activity')).toBeInTheDocument())
      expect(api.createPlanItem).toHaveBeenCalledWith(
        'trip-1',
        expect.objectContaining({ title: 'New activity', day_id: 'day-1' }),
      )
    })

    it('offers a kind picker defaulting to Activity', async () => {
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
      renderDayView()
      await addBar()

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
      const bar = await addBar()

      // Scope to the plan-item form — the day's budget editor also renders a
      // "Transport" category control, so screen-wide queries are ambiguous.
      const form = bar
      await user.click(within(form).getByRole('button', { name: /Transport/ }))
      // Location is replaced by From / To for a transport leg.
      expect(within(form).queryByLabelText('Location')).not.toBeInTheDocument()
      await user.type(within(form).getByLabelText(/^Add to /), 'Train to Porto')
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
      const bar = await addBar()

      const form = bar
      await user.type(within(form).getByLabelText(/^Add to /), 'Kayak')
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
      const bar = await addBar()

      const form = bar
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
      const bar = await addBar()

      const form = bar
      await user.type(within(form).getByLabelText(/^Add to /), 'Buy port wine')
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
      const bar = await addBar()
      // No map pins before adding.
      expect(screen.queryByRole('button', { name: /^Pin 1:/ })).not.toBeInTheDocument()

      await user.type(within(bar).getByLabelText(/^Add to /), 'Kiyomizu-dera')
      await user.click(within(bar).getByRole('button', { name: 'Add' }))

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
      const bar = await addBar()

      await user.type(within(bar).getByLabelText(/^Add to /), 'Offline activity')
      await user.click(within(bar).getByRole('button', { name: 'Add' }))

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

      // The optimistic item is persisted to the on-device day cache so an offline
      // reload keeps showing it (the queued write is safe, but a reload would
      // otherwise re-render only the last server-synced day). Regression guard for
      // the "lost all my offline data on pull-to-refresh" bug.
      await waitFor(async () => {
        const cached = await readCache<Day>(cacheKeys.day('trip-1', '2026-06-01'))
        expect(cached?.data.plan_items.some((i) => i.title === 'Offline activity')).toBe(true)
      })

      onLine.mockRestore()
    })

    it('shows error when add fails', async () => {
      const user = userEvent.setup()
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
      vi.mocked(api.createPlanItem).mockRejectedValue(new Error('network'))

      renderDayView()
      const bar = await addBar()

      await user.type(within(bar).getByLabelText(/^Add to /), 'Bad item')
      await user.click(within(bar).getByRole('button', { name: 'Add' }))

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
      const bar = await addBar()

      const input = within(bar).getByLabelText(/^Add to /) as HTMLInputElement
      await user.type(input, 'Grab a coffee')
      await user.click(within(bar).getByRole('button', { name: 'Add' }))

      await waitFor(() => expect(input.value).toBe(''))
    })

    it('shows Location without expanding, and reveals extra fields on More details', async () => {
      const user = userEvent.setup()
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
      renderDayView()
      const bar = await addBar()

      // Location is always visible in the composer — no click needed.
      expect(within(bar).getByLabelText('Location')).toBeInTheDocument()
      // Extra fields stay behind the disclosure.
      expect(within(bar).queryByLabelText('Start time')).not.toBeInTheDocument()

      await user.click(within(bar).getByRole('button', { name: 'More details' }))
      expect(within(bar).getByLabelText('Start time')).toBeInTheDocument()
    })

    it('confirms a typed location resolves on the map', async () => {
      const user = userEvent.setup()
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
      vi.mocked(api.geocodeLocation).mockResolvedValue({ lat: 48.86, lng: 2.34 })
      renderDayView()
      const bar = await addBar()

      await user.click(within(bar).getByRole('button', { name: 'More details' }))
      await user.type(within(bar).getByLabelText('Location'), 'Louvre, Paris')

      await waitFor(() => expect(screen.getByText(/will show on the map/i)).toBeInTheDocument())
      expect(api.geocodeLocation).toHaveBeenCalledWith('Louvre, Paris', expect.anything())
    })

    it('warns when a typed location cannot be placed', async () => {
      const user = userEvent.setup()
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
      vi.mocked(api.geocodeLocation).mockResolvedValue(null)
      renderDayView()
      const bar = await addBar()

      await user.click(within(bar).getByRole('button', { name: 'More details' }))
      await user.type(within(bar).getByLabelText('Location'), 'asdfqwer')

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
      const bar = await addBar()

      await user.click(within(bar).getByRole('button', { name: 'More details' }))
      await user.type(within(bar).getByLabelText('Location'), 'Fushimi')

      const option = await screen.findByRole('option', {
        name: 'Fushimi Inari Taisha, Kyoto, Japan',
      })
      await user.click(option)

      expect(within(bar).getByLabelText('Location')).toHaveValue(
        'Fushimi Inari Taisha, Kyoto, Japan',
      )
      // Dropdown closes after selection.
      await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    })
  })

  describe('plan details sheet', () => {
    it('tapping an item name opens the details sheet with its fields and status', async () => {
      const user = userEvent.setup()
      const item = makePlanItem({ title: 'Visit museum' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
      renderDayView()
      await waitFor(() => expect(screen.getByText('Visit museum')).toBeInTheDocument())

      await user.click(screen.getAllByRole('button', { name: /Edit Visit museum/ })[0])
      const editingLi = screen.getByRole('dialog', { name: 'Plan details' })
      const titleInput = within(editingLi as HTMLElement).getByLabelText('Title')
      expect((titleInput as HTMLInputElement).value).toBe('Visit museum')
      const status = within(editingLi).getByRole('group', { name: 'Status' })
      expect(within(status).getByRole('button', { name: 'Planned' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      for (const action of ['Move to another day', 'Move to the backlog', /Delete/]) {
        expect(within(editingLi).getByRole('button', { name: action })).toBeInTheDocument()
      }
    })

    it('saves the edit and reflects the update', async () => {
      const user = userEvent.setup()
      const item = makePlanItem({ title: 'Visit museum' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
      const updated = makePlanItem({ title: 'Visit gallery' })
      vi.mocked(api.updatePlanItem).mockResolvedValue(updated)

      renderDayView()
      await waitFor(() => expect(screen.getByText('Visit museum')).toBeInTheDocument())

      await user.click(screen.getAllByRole('button', { name: /Edit Visit museum/ })[0])
      const editingLi = screen.getByRole('dialog', { name: 'Plan details' })
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

      await user.click(screen.getAllByRole('button', { name: /Edit Train to Porto/ })[0])
      const editingLi = screen.getByRole('dialog', { name: 'Plan details' })
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

      await user.click(screen.getAllByRole('button', { name: /Edit Train to Porto/ })[0])
      const editingLi = screen.getByRole('dialog', { name: 'Plan details' })
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

    it('closes the sheet and keeps the item row', async () => {
      const user = userEvent.setup()
      const item = makePlanItem({ title: 'Visit museum' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
      renderDayView()
      await waitFor(() => expect(screen.getByText('Visit museum')).toBeInTheDocument())

      await user.click(screen.getAllByRole('button', { name: /Edit Visit museum/ })[0])
      const editingLi = screen.getByRole('dialog', { name: 'Plan details' })
      expect(within(editingLi as HTMLElement).getByLabelText('Title')).toBeInTheDocument()

      await user.click(within(editingLi as HTMLElement).getByRole('button', { name: 'Close' }))
      expect(screen.queryByRole('dialog', { name: 'Plan details' })).not.toBeInTheDocument()
      expect(screen.getByText('Visit museum')).toBeInTheDocument()
    })

    it('shows error when save fails', async () => {
      const user = userEvent.setup()
      const item = makePlanItem({ title: 'Visit museum' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
      vi.mocked(api.updatePlanItem).mockRejectedValue(new Error('network'))

      renderDayView()
      await waitFor(() => expect(screen.getByText('Visit museum')).toBeInTheDocument())

      await user.click(screen.getAllByRole('button', { name: /Edit Visit museum/ })[0])
      const editingLi = screen.getByRole('dialog', { name: 'Plan details' })
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
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /Edit Flight/ })).toBeInTheDocument(),
      )

      await user.click(screen.getAllByRole('button', { name: /Edit Flight/ })[0])
      const editingLi = screen.getByRole('dialog', { name: 'Plan details' })
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
      await waitFor(() =>
        expect(screen.getAllByText('Flight (part 2/2)').length).toBeGreaterThan(0),
      )
    })

    it('lets you type a fresh part count without clamping mid-keystroke', async () => {
      const user = userEvent.setup()
      const item = makePlanItem({ title: 'Flight', cost: 12 })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))

      renderDayView()
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /Edit Flight/ })).toBeInTheDocument(),
      )

      await user.click(screen.getAllByRole('button', { name: /Edit Flight/ })[0])
      const editingLi = screen.getByRole('dialog', { name: 'Plan details' })
      await user.click(
        within(editingLi as HTMLElement).getByRole('checkbox', {
          name: 'Split this cost into several',
        }),
      )

      // Clear the default "2" and type "6". Typing must NOT re-clamp each keystroke
      // (the old bug turned an appended "6" into 26 → clamped to the max of 12).
      const count = within(editingLi as HTMLElement).getByRole('spinbutton', {
        name: 'Number of parts to split the cost into',
      })
      await user.clear(count)
      await user.type(count, '6')
      expect(count).toHaveValue(6)
      expect(within(editingLi as HTMLElement).getByText(/≈€2\.00 each/)).toBeInTheDocument()
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

    // dragRowByHandle simulates a mobile finger drag: press the grip handle of
    // `title`, move to `toClientY`, lift. jsdom returns empty rects, so we stub
    // getBoundingClientRect to lay the rows out 40px tall from the top; the drag
    // logic reads those to decide where the row lands.
    function dragRowByHandle(title: string, toClientY: number) {
      const rect = (top: number, height: number) =>
        ({
          top,
          height,
          bottom: top + height,
          left: 0,
          right: 300,
          width: 300,
          x: 0,
          y: top,
        }) as DOMRect
      const rectSpy = vi
        .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
        .mockImplementation(function (this: HTMLElement) {
          if (!this.getAttribute('data-item-id')) return rect(0, 0)
          const rows = Array.from(this.parentElement?.children ?? []).filter((el) =>
            el.hasAttribute('data-item-id'),
          )
          return rect(rows.indexOf(this) * 40, 40)
        })
      const handle = screen.getByRole('button', { name: new RegExp(`Drag to reorder ${title}`) })
      // jsdom has no PointerEvent, so fireEvent.pointer* drops clientY. Dispatch
      // MouseEvents (which carry clientY) under the pointer* type names React
      // listens for; pointerType is left undefined, which the drag logic treats
      // as non-mouse (a real finger).
      const pointer = (type: string, clientY: number) =>
        fireEvent(handle, new MouseEvent(type, { bubbles: true, cancelable: true, clientY }))
      pointer('pointerdown', 0)
      pointer('pointermove', toClientY)
      pointer('pointerup', toClientY)
      rectSpy.mockRestore()
    }

    it('desktop: plan beside a rail with stay and map; no journal or budget on the day', async () => {
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
      renderDayView()
      await waitFor(() =>
        expect(screen.getByRole('region', { name: 'Planning' })).toBeInTheDocument(),
      )
      expect(screen.queryByRole('group', { name: 'Day view' })).not.toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Map' })).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Journal' })).not.toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Budget' })).not.toBeInTheDocument()
    })

    it('phone: the day shows only its plan; the journal is its own page', async () => {
      setPhone(true)
      vi.mocked(api.fetchDay).mockResolvedValue(
        makeDay({ plan_items: [makePlanItem({ title: 'Visit museum' })] }),
      )
      const { unmount } = renderDayView()
      expect(await screen.findByRole('region', { name: 'Planning' })).toBeInTheDocument()
      expect(screen.queryByRole('group', { name: 'Day view' })).not.toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Journal' })).not.toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Budget' })).not.toBeInTheDocument()
      unmount()

      renderDayJournal()
      expect(await screen.findByRole('region', { name: 'Journal' })).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Planning' })).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Journal/ })).toHaveAttribute(
        'href',
        '/trips/trip-1/journal',
      )
      // Journal: diary + what happened + log something unplanned.
      expect(screen.getByText('What happened')).toBeInTheDocument()
    })

    it('phone: one pinned add bar (no FAB, no always-open form)', async () => {
      setPhone(true)
      setMobile(true)
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay())
      renderDayView()
      expect(await screen.findByLabelText('Add to Monday')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Add activity' })).not.toBeInTheDocument()
      expect(screen.queryByRole('group', { name: 'Kind' })).not.toBeInTheDocument()
    })

    it('phone: the details sheet is a modal dialog and Escape closes it', async () => {
      setPhone(true)
      setMobile(true)
      const user = userEvent.setup()
      vi.mocked(api.fetchDay).mockResolvedValue(
        makeDay({ plan_items: [makePlanItem({ title: 'Visit museum' })] }),
      )
      renderDayView()
      await waitFor(() => expect(screen.getByText('Visit museum')).toBeInTheDocument())
      const dialog = await openDetails(user, 'Visit museum')
      expect(dialog).toHaveAttribute('aria-modal', 'true')
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByRole('dialog', { name: 'Plan details' })).not.toBeInTheDocument()
    })

    it('renders a drag handle on mobile for untimed items', async () => {
      setMobile(true)
      const items = [
        makePlanItem({ id: 'i1', title: 'First', sort_order: 0 }),
        makePlanItem({ id: 'i2', title: 'Second', sort_order: 1 }),
      ]
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: items }))
      renderDayView()
      await waitFor(() => expect(screen.getByText('First')).toBeInTheDocument())
      expect(screen.getByRole('button', { name: /Drag to reorder First/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Drag to reorder Second/ })).toBeInTheDocument()
    })

    it('touch drag reorders and calls reorderPlanItems', async () => {
      setMobile(true)
      const items = [
        makePlanItem({ id: 'i1', title: 'First', sort_order: 0 }),
        makePlanItem({ id: 'i2', title: 'Second', sort_order: 1 }),
      ]
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: items }))
      vi.mocked(api.reorderPlanItems).mockResolvedValue()
      renderDayView()
      await waitFor(() => expect(screen.getByText('Second')).toBeInTheDocument())

      // Drag "Second" up above "First".
      dragRowByHandle('Second', 5)

      await waitFor(() =>
        expect(api.reorderPlanItems).toHaveBeenCalledWith('trip-1', 'day-1', ['i2', 'i1']),
      )
    })

    it('tapping the drag handle without moving does not reorder', async () => {
      setMobile(true)
      const items = [
        makePlanItem({ id: 'i1', title: 'First', sort_order: 0 }),
        makePlanItem({ id: 'i2', title: 'Second', sort_order: 1 }),
      ]
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: items }))
      vi.mocked(api.reorderPlanItems).mockResolvedValue()
      renderDayView()
      await waitFor(() => expect(screen.getByText('Second')).toBeInTheDocument())

      // A press-and-lift that never crosses another row's midpoint (stays on its
      // own row) must not fire a no-op reorder request.
      dragRowByHandle('Second', 45)

      expect(api.reorderPlanItems).not.toHaveBeenCalled()
    })

    it('reorders offline: queues reorderPlanItems, no server call, order persists to cache', async () => {
      setMobile(true)
      const items = [
        makePlanItem({ id: 'i1', title: 'First', sort_order: 0 }),
        makePlanItem({ id: 'i2', title: 'Second', sort_order: 1 }),
      ]
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: items }))
      const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

      renderDayView()
      await waitFor(() => expect(screen.getByText('Second')).toBeInTheDocument())

      dragRowByHandle('Second', 5)

      await waitFor(() =>
        expect(enqueue).toHaveBeenCalledWith('reorderPlanItems', {
          tripId: 'trip-1',
          dayId: 'day-1',
          itemIds: ['i2', 'i1'],
        }),
      )
      expect(api.reorderPlanItems).not.toHaveBeenCalled()
      // New order is written to the day cache so an offline reload keeps it.
      await waitFor(async () => {
        const cached = await readCache<Day>(cacheKeys.day('trip-1', '2026-06-01'))
        expect(cached?.data.plan_items.map((i) => i.id)).toEqual(['i2', 'i1'])
      })

      onLine.mockRestore()
    })

    it('reordering the plan keeps logged items in "What happened"', async () => {
      setMobile(true)
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
      await waitFor(() => expect(screen.getByText('Second')).toBeInTheDocument())

      dragRowByHandle('Second', 5)

      // The reorder sends the full day order — the logged item stays at the end
      // (its slot is fixed), so it keeps its position and its state entry.
      await waitFor(() =>
        expect(api.reorderPlanItems).toHaveBeenCalledWith('trip-1', 'day-1', ['i2', 'i1', 'd1']),
      )
    })

    it('reorders "What happened" via the actual-order endpoint, leaving the plan untouched', async () => {
      setMobile(true)
      // Two logged-after-the-fact items live only under What happened, so its
      // list is the only draggable one on screen.
      const items = [
        makePlanItem({
          id: 'd1',
          title: 'Kayak',
          status: 'done',
          unplanned: true,
          sort_order: 0,
          actual_order: 0,
        }),
        makePlanItem({
          id: 'd2',
          title: 'Gelato',
          status: 'done',
          unplanned: true,
          sort_order: 1,
          actual_order: 1,
        }),
      ]
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: items }))
      vi.mocked(api.reorderPlanItemsActual).mockResolvedValue()
      renderDayJournal()
      await waitFor(() => expect(screen.getByText('Gelato')).toBeInTheDocument())

      // Drag "Gelato" above "Kayak".
      dragRowByHandle('Gelato', 5)

      // The "what happened" order is persisted to the actual-order endpoint —
      // the planned reorder (sort_order) is never called.
      await waitFor(() =>
        expect(api.reorderPlanItemsActual).toHaveBeenCalledWith('trip-1', 'day-1', ['d2', 'd1']),
      )
      expect(api.reorderPlanItems).not.toHaveBeenCalled()
    })

    it('reordering the plan (sort_order) does not touch the actual order', async () => {
      setMobile(true)
      const items = [
        makePlanItem({ id: 'i1', title: 'First', sort_order: 0 }),
        makePlanItem({ id: 'i2', title: 'Second', sort_order: 1 }),
      ]
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: items }))
      vi.mocked(api.reorderPlanItems).mockResolvedValue()
      renderDayView()
      await waitFor(() => expect(screen.getByText('Second')).toBeInTheDocument())

      dragRowByHandle('Second', 5)

      await waitFor(() =>
        expect(api.reorderPlanItems).toHaveBeenCalledWith('trip-1', 'day-1', ['i2', 'i1']),
      )
      expect(api.reorderPlanItemsActual).not.toHaveBeenCalled()
    })

    it('renumbers map pins immediately after a reorder (no refresh)', async () => {
      setMobile(true)
      const items = [
        makePlanItem({ id: 'i1', title: 'First', location: 'Paris', sort_order: 0 }),
        makePlanItem({ id: 'i2', title: 'Second', location: 'Lyon', sort_order: 1 }),
      ]
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: items }))
      vi.mocked(api.reorderPlanItems).mockResolvedValue()
      renderDayView()
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Map pin 1 for First' })).toBeInTheDocument(),
      )

      // Drag "Second" above "First": pins should swap without a data refetch.
      dragRowByHandle('Second', 5)

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Map pin 1 for Second' })).toBeInTheDocument(),
      )
      expect(screen.getByRole('button', { name: 'Map pin 2 for First' })).toBeInTheDocument()
    })
  })

  describe('tick to done and re-planning', () => {
    it('ticking an item marks it done (setPlanItemStatus) and unticking returns it to planned', async () => {
      const user = userEvent.setup()
      const item = makePlanItem({ title: 'Visit museum', status: 'planned' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
      vi.mocked(api.setPlanItemStatus)
        .mockResolvedValueOnce({ ...item, status: 'done' })
        .mockResolvedValueOnce({ ...item, status: 'planned' })

      renderDayView()
      const tick = await screen.findByRole('button', { name: 'Mark done: Visit museum' })
      expect(tick).toHaveAttribute('aria-pressed', 'false')
      await user.click(tick)

      await waitFor(() =>
        expect(api.setPlanItemStatus).toHaveBeenCalledWith('trip-1', 'item-1', 'done'),
      )
      const ticked = await screen.findAllByRole('button', { name: 'Mark not done: Visit museum' })
      expect(ticked[0]).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getAllByLabelText('Visit museum — Done')).toHaveLength(1)

      await user.click(ticked[0])
      await waitFor(() =>
        expect(api.setPlanItemStatus).toHaveBeenLastCalledWith('trip-1', 'item-1', 'planned'),
      )
    })

    it('ticks done offline: queues the status write, no server call, persists to cache', async () => {
      const user = userEvent.setup()
      const item = makePlanItem({ title: 'Visit museum', status: 'planned' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
      const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

      renderDayView()
      await user.click(await screen.findByRole('button', { name: 'Mark done: Visit museum' }))

      await waitFor(() =>
        expect(enqueue).toHaveBeenCalledWith('setPlanItemStatus', {
          tripId: 'trip-1',
          itemId: 'item-1',
          status: 'done',
        }),
      )
      expect(api.setPlanItemStatus).not.toHaveBeenCalled()
      await waitFor(async () => {
        const cached = await readCache<Day>(cacheKeys.day('trip-1', '2026-06-01'))
        expect(cached?.data.plan_items.find((i) => i.id === 'item-1')?.status).toBe('done')
      })
      onLine.mockRestore()
    })

    it('sets Skipped from the details sheet status control', async () => {
      const user = userEvent.setup()
      const item = makePlanItem({ title: 'Visit museum', status: 'planned' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
      vi.mocked(api.setPlanItemStatus).mockResolvedValue({ ...item, status: 'skipped' })

      renderDayView()
      await waitFor(() => expect(screen.getByText('Visit museum')).toBeInTheDocument())
      const dialog = await openDetails(user, 'Visit museum')
      const status = within(dialog).getByRole('group', { name: 'Status' })
      await user.click(within(status).getByRole('button', { name: 'Skipped' }))

      await waitFor(() =>
        expect(api.setPlanItemStatus).toHaveBeenCalledWith('trip-1', 'item-1', 'skipped'),
      )
      await waitFor(() =>
        expect(within(status).getByRole('button', { name: 'Skipped' })).toHaveAttribute(
          'aria-pressed',
          'true',
        ),
      )
    })

    it('moves an item to another day from the sheet', async () => {
      const user = userEvent.setup()
      const item = makePlanItem({ title: 'Visit museum' })
      vi.mocked(api.fetchDay).mockImplementation(async (_t, date) =>
        date === '2026-06-01'
          ? makeDay({ plan_items: [item] })
          : makeDay({ id: 'day-2', date: '2026-06-02', index: 1 }),
      )
      vi.mocked(api.movePlanItem).mockResolvedValue(undefined as never)

      renderDayView()
      await waitFor(() => expect(screen.getByText('Visit museum')).toBeInTheDocument())
      const dialog = await openDetails(user, 'Visit museum')
      await user.click(within(dialog).getByRole('button', { name: 'Move to another day' }))
      expect(within(dialog).getByLabelText('Move to')).toBeInTheDocument()
      await user.click(within(dialog).getByRole('button', { name: 'Move' }))

      await waitFor(() =>
        expect(api.movePlanItem).toHaveBeenCalledWith('trip-1', 'item-1', 'day-2'),
      )
      await waitFor(() => expect(screen.queryByText('Visit museum')).not.toBeInTheDocument())
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('moves offline: queues movePlanItem, removes from this day, adds to target day cache', async () => {
      const user = userEvent.setup()
      const item = makePlanItem({ title: 'Visit museum' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
      await writeCache(cacheKeys.day('trip-1', '2026-06-02'), {
        ...makeDay({ id: 'day-2', date: '2026-06-02', plan_items: [] }),
      })
      const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

      renderDayView()
      await waitFor(() => expect(screen.getByText('Visit museum')).toBeInTheDocument())
      const dialog = await openDetails(user, 'Visit museum')
      await user.click(within(dialog).getByRole('button', { name: 'Move to another day' }))
      await user.click(within(dialog).getByRole('button', { name: 'Move' }))

      await waitFor(() =>
        expect(enqueue).toHaveBeenCalledWith('movePlanItem', {
          tripId: 'trip-1',
          itemId: 'item-1',
          dayId: 'day-2',
        }),
      )
      expect(api.movePlanItem).not.toHaveBeenCalled()
      await waitFor(() => expect(screen.queryByText('Visit museum')).not.toBeInTheDocument())
      await waitFor(async () => {
        const cached = await readCache<Day>(cacheKeys.day('trip-1', '2026-06-02'))
        expect(cached?.data.plan_items.some((i) => i.id === 'item-1')).toBe(true)
      })
      onLine.mockRestore()
    })

    it('moves an item to the backlog from the sheet', async () => {
      const user = userEvent.setup()
      const item = makePlanItem({ title: 'Visit museum' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
      vi.mocked(api.demotePlanItem).mockResolvedValue({ ...item, day_id: undefined })

      renderDayView()
      await waitFor(() => expect(screen.getByText('Visit museum')).toBeInTheDocument())
      const dialog = await openDetails(user, 'Visit museum')
      await user.click(within(dialog).getByRole('button', { name: 'Move to the backlog' }))

      await waitFor(() => expect(api.demotePlanItem).toHaveBeenCalledWith('trip-1', 'item-1'))
      await waitFor(() => expect(screen.queryByText('Visit museum')).not.toBeInTheDocument())
    })

    it('deletes after an in-page confirm (no window.confirm)', async () => {
      const user = userEvent.setup()
      const confirmSpy = vi.spyOn(window, 'confirm')
      const item = makePlanItem({ title: 'Visit museum' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
      vi.mocked(api.deletePlanItem).mockResolvedValue(undefined)

      renderDayView()
      await waitFor(() => expect(screen.getByText('Visit museum')).toBeInTheDocument())
      const dialog = await openDetails(user, 'Visit museum')
      await user.click(within(dialog).getByRole('button', { name: /^Delete$/ }))
      await user.click(within(dialog).getByRole('button', { name: 'Confirm delete Visit museum' }))

      await waitFor(() => expect(api.deletePlanItem).toHaveBeenCalledWith('trip-1', 'item-1'))
      await waitFor(() => expect(screen.queryByText('Visit museum')).not.toBeInTheDocument())
      expect(confirmSpy).not.toHaveBeenCalled()
    })

    it('“Keep it” cancels the delete', async () => {
      const user = userEvent.setup()
      const item = makePlanItem({ title: 'Visit museum' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))

      renderDayView()
      await waitFor(() => expect(screen.getByText('Visit museum')).toBeInTheDocument())
      const dialog = await openDetails(user, 'Visit museum')
      await user.click(within(dialog).getByRole('button', { name: /^Delete$/ }))
      await user.click(within(dialog).getByRole('button', { name: 'Keep it' }))
      expect(api.deletePlanItem).not.toHaveBeenCalled()
      expect(
        within(dialog).getByRole('button', { name: 'Move to the backlog' }),
      ).toBeInTheDocument()
    })

    it('deletes offline: queues the delete and removes it from view', async () => {
      const user = userEvent.setup()
      const item = makePlanItem({ title: 'Visit museum' })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [item] }))
      const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

      renderDayView()
      await waitFor(() => expect(screen.getByText('Visit museum')).toBeInTheDocument())
      const dialog = await openDetails(user, 'Visit museum')
      await user.click(within(dialog).getByRole('button', { name: /^Delete$/ }))
      await user.click(within(dialog).getByRole('button', { name: 'Confirm delete Visit museum' }))

      await waitFor(() =>
        expect(enqueue).toHaveBeenCalledWith('deletePlanItem', {
          tripId: 'trip-1',
          itemId: 'item-1',
        }),
      )
      expect(api.deletePlanItem).not.toHaveBeenCalled()
      await waitFor(() => expect(screen.queryByText('Visit museum')).not.toBeInTheDocument())
      onLine.mockRestore()
    })

    it('renders transport legs like any other row, with a tag', async () => {
      const leg = makePlanItem({
        id: 't1',
        title: 'Ferry to Gorée',
        kind: 'transport',
        origin: 'Dakar port',
        destination: 'Gorée',
      })
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: [leg] }))
      renderDayView()
      const row = await screen.findByLabelText('Ferry to Gorée')
      // Same row, tick and spacing as every other item (no indent, no small tick).
      expect(row).toHaveClass('plan-row')
      expect(row).not.toHaveClass('plan-row--leg')
      expect(within(row).getByRole('button', { name: 'Mark done: Ferry to Gorée' })).toHaveClass(
        'tick',
      )
      expect(
        within(row).getByRole('button', { name: 'Mark done: Ferry to Gorée' }),
      ).not.toHaveClass('tick--sm')
      expect(within(row).getByText('Ferry')).toBeInTheDocument()
      expect(within(row).getByText('Dakar port → Gorée')).toBeInTheDocument()
    })

    it('untimed items render drag handles; timed items do not', async () => {
      const items = [
        makePlanItem({ id: 'u', title: 'Untimed', sort_order: 0 }),
        makePlanItem({ id: 't', title: 'Timed', start_time: '10:00:00', sort_order: 1 }),
      ]
      vi.mocked(api.fetchDay).mockResolvedValue(makeDay({ plan_items: items }))
      renderDayView()
      await waitFor(() => expect(screen.getByText('Untimed')).toBeInTheDocument())
      expect(screen.getByRole('button', { name: 'Drag to reorder Untimed' })).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Drag to reorder Timed' }),
      ).not.toBeInTheDocument()
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

      await user.click(screen.getAllByRole('button', { name: /Edit Visit museum/ })[0])
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

      await user.click(screen.getAllByRole('button', { name: /Edit Visit museum/ })[0])
      const editingLi = screen.getByRole('dialog', { name: 'Plan details' })
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

      await user.click(screen.getAllByRole('button', { name: /Edit Visit/ })[0])
      const editingLi = screen.getByRole('dialog', { name: 'Plan details' })
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

      await user.click(screen.getAllByRole('button', { name: /Edit Visit museum/ })[0])
      const editingLi = screen.getByRole('dialog', { name: 'Plan details' })
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

      await user.click(screen.getAllByRole('button', { name: /Edit Visit museum/ })[0])
      const editingLi = screen.getByRole('dialog', { name: 'Plan details' })
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

      await user.click(screen.getAllByRole('button', { name: /Edit Visit museum/ })[0])
      const editingLi = screen.getByRole('dialog', { name: 'Plan details' })
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
      expect(itemLi).toHaveClass('plan-row--selected')
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
      expect(itemLi).not.toHaveClass('plan-row--selected')
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
      expect(eiffelLi).not.toHaveClass('plan-row--selected')
      expect(louvreLi).toHaveClass('plan-row--selected')
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
      // "Hotel Paris" also shows in the day hero; assert the stay card's pin badge.
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: /Map pin 1 for Hotel Paris/ }),
        ).toBeInTheDocument(),
      )
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

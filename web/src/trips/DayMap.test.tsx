import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DayMap from './DayMap'
import * as api from '../lib/api'
import type { Day } from '../lib/api'

vi.mock('../lib/api', async (importOriginal) => {
  const orig = await importOriginal<typeof api>()
  return {
    ...orig,
    fetchDayRoute: vi.fn(),
    staticMapUrl: vi.fn(),
  }
})

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

function renderDayMap(day: Day) {
  return render(<DayMap day={day} selectedId={null} onSelect={vi.fn()} />)
}

describe('DayMap', () => {
  beforeEach(() => {
    vi.mocked(api.fetchDayRoute).mockResolvedValue({ waypoints: [] })
    vi.mocked(api.staticMapUrl).mockReturnValue(null)
  })

  afterEach(() => {
    cleanup()
    vi.resetAllMocks()
  })

  it('shows loading while fetching waypoints', () => {
    vi.mocked(api.fetchDayRoute).mockReturnValue(new Promise(() => {}))
    renderDayMap(
      makeDay({
        stays: [{ id: 's1', trip_id: 'trip-1', name: 'Hotel', location: 'Paris' }],
      }),
    )
    expect(screen.getByText('Loading map…')).toBeTruthy()
  })

  it('shows empty state when no located items', async () => {
    renderDayMap(makeDay())
    await waitFor(() => {
      expect(screen.getByText('No located stops for this day.')).toBeTruthy()
    })
    expect(api.fetchDayRoute).not.toHaveBeenCalled()
  })

  it('shows empty state when all waypoints unresolvable', async () => {
    vi.mocked(api.fetchDayRoute).mockResolvedValue({ waypoints: [] })
    renderDayMap(
      makeDay({
        stays: [{ id: 's1', trip_id: 'trip-1', name: 'Hotel', location: 'Nowhere' }],
      }),
    )
    await waitFor(() => {
      expect(screen.getByText('No located stops for this day.')).toBeTruthy()
    })
  })

  it('renders map img when waypoints are returned', async () => {
    const waypoints = [
      { lat: 48.8566, lng: 2.3522 },
      { lat: 48.86, lng: 2.36 },
    ]
    vi.mocked(api.fetchDayRoute).mockResolvedValue({ waypoints })
    vi.mocked(api.staticMapUrl).mockReturnValue('http://localhost:8080/geo/static-map?markers=...')
    renderDayMap(
      makeDay({
        stays: [{ id: 's1', trip_id: 'trip-1', name: 'Hotel', location: 'Paris' }],
        plan_items: [
          {
            id: 'i1',
            trip_id: 'trip-1',
            day_id: 'day-1',
            title: 'Eiffel Tower',
            location: 'Eiffel Tower, Paris',
            sort_order: 0,
            status: 'planned',
          },
        ],
      }),
    )
    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Map for 2026-06-01' })).toBeTruthy()
    })
  })

  it('shows error state when fetchDayRoute rejects', async () => {
    vi.mocked(api.fetchDayRoute).mockRejectedValue(new Error('network'))
    renderDayMap(
      makeDay({
        stays: [{ id: 's1', trip_id: 'trip-1', name: 'Hotel', location: 'Paris' }],
      }),
    )
    await waitFor(() => {
      expect(screen.getByText('Map unavailable.')).toBeTruthy()
    })
  })

  it('passes locations in itinerary order (stay first, then plan items by sort_order)', async () => {
    vi.mocked(api.fetchDayRoute).mockResolvedValue({ waypoints: [] })
    renderDayMap(
      makeDay({
        stays: [{ id: 's1', trip_id: 'trip-1', name: 'Hotel', location: 'Stay loc' }],
        plan_items: [
          {
            id: 'i2',
            trip_id: 'trip-1',
            day_id: 'day-1',
            title: 'Item B',
            location: 'Loc B',
            sort_order: 1,
            status: 'planned',
          },
          {
            id: 'i1',
            trip_id: 'trip-1',
            day_id: 'day-1',
            title: 'Item A',
            location: 'Loc A',
            sort_order: 0,
            status: 'planned',
          },
        ],
      }),
    )
    await waitFor(() => {
      expect(api.fetchDayRoute).toHaveBeenCalledWith(
        ['Stay loc', 'Loc A', 'Loc B'],
        expect.any(AbortSignal),
      )
    })
  })
})

// S3: indicative route & location-less omission
describe('DayMap — route and omission (S3)', () => {
  beforeEach(() => {
    vi.mocked(api.fetchDayRoute).mockResolvedValue({ waypoints: [] })
    vi.mocked(api.staticMapUrl).mockReturnValue(null)
  })

  afterEach(() => {
    cleanup()
    vi.resetAllMocks()
  })

  it('passes location-less items as empty strings so the server can skip them', async () => {
    vi.mocked(api.fetchDayRoute).mockResolvedValue({ waypoints: [] })
    renderDayMap(
      makeDay({
        plan_items: [
          {
            id: 'i1',
            trip_id: 'trip-1',
            day_id: 'day-1',
            title: 'No location item',
            sort_order: 0,
            status: 'planned',
            // location intentionally absent
          },
          {
            id: 'i2',
            trip_id: 'trip-1',
            day_id: 'day-1',
            title: 'Located item',
            location: 'Paris',
            sort_order: 1,
            status: 'planned',
          },
        ],
      }),
    )
    await waitFor(() => {
      expect(api.fetchDayRoute).toHaveBeenCalledWith(
        // location-less item passes '' (server skips it); located item passes its value
        ['', 'Paris'],
        expect.any(AbortSignal),
      )
    })
  })

  it('shows empty state when all returned waypoints are empty (all items unresolvable)', async () => {
    vi.mocked(api.fetchDayRoute).mockResolvedValue({ waypoints: [] })
    renderDayMap(
      makeDay({
        stays: [{ id: 's1', trip_id: 'trip-1', name: 'Hotel', location: 'Fake Town' }],
      }),
    )
    await waitFor(() => {
      expect(screen.getByText('No located stops for this day.')).toBeTruthy()
    })
  })

  it('renders map when at least one waypoint resolved (mixed day)', async () => {
    const waypoints = [{ lat: 48.8566, lng: 2.3522 }]
    vi.mocked(api.fetchDayRoute).mockResolvedValue({ waypoints })
    vi.mocked(api.staticMapUrl).mockReturnValue('http://localhost:8080/geo/static-map?markers=...')
    renderDayMap(
      makeDay({
        stays: [{ id: 's1', trip_id: 'trip-1', name: 'Hotel', location: 'Paris' }],
        plan_items: [
          {
            id: 'i1',
            trip_id: 'trip-1',
            day_id: 'day-1',
            title: 'No location item',
            sort_order: 0,
            status: 'planned',
          },
        ],
      }),
    )
    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Map for 2026-06-01' })).toBeTruthy()
    })
  })
})

// M07.4 S2 — pin legend two-way correlation
describe('DayMap — pin legend (M07.4 S2)', () => {
  beforeEach(() => {
    vi.mocked(api.fetchDayRoute).mockResolvedValue({ waypoints: [] })
    vi.mocked(api.staticMapUrl).mockReturnValue(null)
  })

  afterEach(() => {
    cleanup()
    vi.resetAllMocks()
  })

  it('renders numbered pin buttons for each located item when waypoints exist', async () => {
    const waypoints = [
      { lat: 48.8566, lng: 2.3522 },
      { lat: 48.86, lng: 2.36 },
    ]
    vi.mocked(api.fetchDayRoute).mockResolvedValue({ waypoints })
    vi.mocked(api.staticMapUrl).mockReturnValue('http://localhost/map')
    renderDayMap(
      makeDay({
        stays: [{ id: 's1', trip_id: 'trip-1', name: 'Hotel', location: 'Paris' }],
        plan_items: [
          {
            id: 'i1',
            trip_id: 'trip-1',
            day_id: 'day-1',
            title: 'Eiffel Tower',
            location: 'Eiffel Tower',
            sort_order: 0,
            status: 'planned',
          },
        ],
      }),
    )
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Pin 1: Hotel' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Pin 2: Eiffel Tower' })).toBeTruthy()
    })
  })

  it('clicking a pin button calls onSelect with the item id', async () => {
    const onSelect = vi.fn()
    const waypoints = [{ lat: 48.8566, lng: 2.3522 }]
    vi.mocked(api.fetchDayRoute).mockResolvedValue({ waypoints })
    vi.mocked(api.staticMapUrl).mockReturnValue('http://localhost/map')
    const user = userEvent.setup()

    render(
      <DayMap
        day={makeDay({
          plan_items: [
            {
              id: 'i1',
              trip_id: 'trip-1',
              day_id: 'day-1',
              title: 'Eiffel Tower',
              location: 'Eiffel Tower',
              sort_order: 0,
              status: 'planned',
            },
          ],
        })}
        selectedId={null}
        onSelect={onSelect}
      />,
    )
    await waitFor(() => screen.getByRole('button', { name: 'Pin 1: Eiffel Tower' }))
    await user.click(screen.getByRole('button', { name: 'Pin 1: Eiffel Tower' }))
    expect(onSelect).toHaveBeenCalledWith('i1')
  })

  it('clicking a selected pin button calls onSelect with null (deselect toggle)', async () => {
    const onSelect = vi.fn()
    const waypoints = [{ lat: 48.8566, lng: 2.3522 }]
    vi.mocked(api.fetchDayRoute).mockResolvedValue({ waypoints })
    vi.mocked(api.staticMapUrl).mockReturnValue('http://localhost/map')
    const user = userEvent.setup()

    render(
      <DayMap
        day={makeDay({
          plan_items: [
            {
              id: 'i1',
              trip_id: 'trip-1',
              day_id: 'day-1',
              title: 'Eiffel Tower',
              location: 'Eiffel Tower',
              sort_order: 0,
              status: 'planned',
            },
          ],
        })}
        selectedId="i1"
        onSelect={onSelect}
      />,
    )
    await waitFor(() => screen.getByRole('button', { name: 'Pin 1: Eiffel Tower' }))
    await user.click(screen.getByRole('button', { name: 'Pin 1: Eiffel Tower' }))
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('selected pin has aria-pressed=true and --selected CSS class', async () => {
    const waypoints = [{ lat: 48.8566, lng: 2.3522 }]
    vi.mocked(api.fetchDayRoute).mockResolvedValue({ waypoints })
    vi.mocked(api.staticMapUrl).mockReturnValue('http://localhost/map')

    render(
      <DayMap
        day={makeDay({
          plan_items: [
            {
              id: 'i1',
              trip_id: 'trip-1',
              day_id: 'day-1',
              title: 'Eiffel Tower',
              location: 'Eiffel Tower',
              sort_order: 0,
              status: 'planned',
            },
          ],
        })}
        selectedId="i1"
        onSelect={vi.fn()}
      />,
    )
    await waitFor(() => screen.getByRole('button', { name: 'Pin 1: Eiffel Tower' }))
    const btn = screen.getByRole('button', { name: 'Pin 1: Eiffel Tower' })
    expect(btn).toHaveAttribute('aria-pressed', 'true')
    expect(btn).toHaveClass('day-map-pin--selected')
  })

  it('location-less items do not appear in the pin legend', async () => {
    const waypoints = [{ lat: 48.8566, lng: 2.3522 }]
    vi.mocked(api.fetchDayRoute).mockResolvedValue({ waypoints })
    vi.mocked(api.staticMapUrl).mockReturnValue('http://localhost/map')

    renderDayMap(
      makeDay({
        plan_items: [
          {
            id: 'i1',
            trip_id: 'trip-1',
            day_id: 'day-1',
            title: 'No location',
            sort_order: 0,
            status: 'planned',
          },
          {
            id: 'i2',
            trip_id: 'trip-1',
            day_id: 'day-1',
            title: 'Located',
            location: 'Paris',
            sort_order: 1,
            status: 'planned',
          },
        ],
      }),
    )
    await waitFor(() => screen.getByRole('button', { name: 'Pin 1: Located' }))
    expect(screen.queryByRole('button', { name: /No location/ })).not.toBeInTheDocument()
  })
})

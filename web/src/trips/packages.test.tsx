import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import * as api from '../lib/api'
import type { Day, TripPackage } from '../lib/api'
import {
  coverDays,
  packageDay,
  packageForDate,
  packageForItem,
  packageTestReset,
  upsertPackage,
  usePackages,
} from './packages'
import { PackageSheet } from './PackageSheet'
import { PackageBanner } from './PackageBanner'
import { PackagePicker } from './PackagePicker'
import { MoneyPackages } from './MoneyPackages'

vi.mock('../lib/api', async (importOriginal) => {
  const orig = await importOriginal<typeof api>()
  return {
    ...orig,
    fetchPackages: vi.fn(),
    createPackage: vi.fn(),
    updatePackage: vi.fn(),
    deletePackage: vi.fn(),
  }
})
vi.mock('../lib/resourceCache', () => ({
  readCache: vi.fn().mockResolvedValue(null),
  writeCache: vi.fn().mockResolvedValue(undefined),
}))

const STAY = '11111111-1111-1111-1111-111111111111'
const TRAIN = '22222222-2222-2222-2222-222222222222'
const CROSSING = '33333333-3333-3333-3333-333333333333'

function pkg(over: Partial<TripPackage> = {}): TripPackage {
  return {
    id: 'pkg-1',
    trip_id: 'trip-1',
    name: 'Mauritania Round 18',
    provider: 'Against the Compass',
    link: '',
    total_cost: 1200,
    paid_amount: 1200,
    balance_due: null,
    start_date: '2026-11-29',
    end_date: '2026-12-06',
    includes: ['beds', 'transport', 'meals'],
    stay_ids: [STAY],
    plan_item_ids: [TRAIN],
    created_at: '',
    updated_at: '',
    ...over,
  }
}

function day(date: string, over: Partial<Day> = {}): Day {
  return {
    id: `day-${date}`,
    trip_id: 'trip-1',
    date,
    index: 0,
    notes: '',
    stays: [],
    plan_items: [],
    ...over,
  }
}

const dates = ['2026-11-28', '2026-11-29', '2026-11-30']
const days: Day[] = [
  day('2026-11-28', {
    plan_items: [
      { id: 'djoudj', trip_id: 'trip-1', title: 'Djoudj', sort_order: 0, status: 'planned' },
    ],
  }),
  day('2026-11-29', {
    stays: [
      {
        id: STAY,
        trip_id: 'trip-1',
        name: 'Tour hotel · Nouakchott',
        check_in: '2026-11-29',
        check_out: '2026-12-01',
      },
    ],
    plan_items: [
      {
        id: CROSSING,
        trip_id: 'trip-1',
        title: 'Rosso crossing',
        kind: 'transport',
        sort_order: 0,
        status: 'planned',
      },
      {
        id: 'n1',
        trip_id: 'trip-1',
        title: 'Passport copies',
        kind: 'note',
        sort_order: 1,
        status: 'planned',
      },
    ],
  }),
  day('2026-11-30', {
    stays: [
      {
        id: STAY,
        trip_id: 'trip-1',
        name: 'Tour hotel · Nouakchott',
        check_in: '2026-11-29',
        check_out: '2026-12-01',
      },
    ],
    plan_items: [
      {
        id: TRAIN,
        trip_id: 'trip-1',
        title: '4x4 to Azouega',
        kind: 'transport',
        sort_order: 0,
        status: 'planned',
      },
    ],
  }),
]

beforeEach(() => {
  packageTestReset()
  vi.mocked(api.fetchPackages).mockResolvedValue([pkg()])
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('package helpers', () => {
  it('finds the package for a date, an item, and the day number within it', () => {
    const list = [pkg()]
    expect(packageForDate(list, '2026-11-28')).toBeUndefined()
    expect(packageForDate(list, '2026-12-03')?.id).toBe('pkg-1')
    expect(packageForItem(list, TRAIN)?.id).toBe('pkg-1')
    expect(packageDay(list[0], '2026-12-03')).toEqual({ day: 5, of: 8 })
  })

  it('lists what a package could cover: stays once, items without notes', () => {
    const cover = coverDays(dates, days, '2026-11-29', '2026-12-06')
    expect(cover.map((d) => d.date)).toEqual(['2026-11-29', '2026-11-30'])
    expect(cover[0].rows.map((r) => r.key)).toEqual([`stay:${STAY}`, `item:${CROSSING}`])
    expect(cover[1].rows.map((r) => r.key)).toEqual([`item:${TRAIN}`])
  })

  it('keeps every component on the same list when one changes it', async () => {
    const a = renderHook(() => usePackages('trip-1'))
    const b = renderHook(() => usePackages('trip-1'))
    await waitFor(() => expect(a.result.current).toHaveLength(1))
    act(() =>
      upsertPackage(
        'trip-1',
        pkg({ id: 'pkg-2', name: 'Ski week', start_date: '2027-01-01', end_date: '2027-01-07' }),
      ),
    )
    expect(a.result.current).toHaveLength(2)
    expect(b.result.current?.map((p) => p.name)).toEqual(['Mauritania Round 18', 'Ski week'])
  })
})

describe('PackageSheet', () => {
  function renderSheet(p?: TripPackage) {
    const onClose = vi.fn()
    render(
      <PackageSheet
        tripId="trip-1"
        tripStart="2026-11-18"
        tripEnd="2026-12-09"
        dates={dates}
        days={days}
        pkg={p}
        onClose={onClose}
      />,
    )
    return onClose
  }

  it('adds a package: details, then what it covers (ticked by default), then saves', async () => {
    const user = userEvent.setup()
    vi.mocked(api.createPackage).mockResolvedValue(pkg({ id: 'pkg-9' }))
    const onClose = renderSheet()
    await user.type(screen.getByLabelText('Name'), 'Mauritania Round 18')
    await user.type(screen.getByLabelText('Booked with'), 'Against the Compass')
    await user.type(screen.getByLabelText('Total price (EUR)'), '1200')
    await user.clear(screen.getByLabelText('First day'))
    await user.type(screen.getByLabelText('First day'), '2026-11-29')
    await user.clear(screen.getByLabelText('Last day'))
    await user.type(screen.getByLabelText('Last day'), '2026-12-06')
    await user.click(screen.getByRole('button', { name: 'Meals' }))
    await user.click(screen.getByRole('button', { name: 'Next: what it covers' }))

    // Everything on the package's days is ticked; untick the Rosso crossing.
    const crossing = screen.getByRole('checkbox', { name: /Rosso crossing/ })
    expect(crossing).toBeChecked()
    expect(screen.queryByText('Djoudj')).not.toBeInTheDocument()
    expect(screen.queryByText('Passport copies')).not.toBeInTheDocument()
    await user.click(crossing)
    await user.click(screen.getByRole('button', { name: 'Save package' }))

    await waitFor(() =>
      expect(api.createPackage).toHaveBeenCalledWith('trip-1', {
        name: 'Mauritania Round 18',
        provider: 'Against the Compass',
        link: '',
        total_cost: 1200,
        paid_amount: 1200,
        balance_due: null,
        start_date: '2026-11-29',
        end_date: '2026-12-06',
        includes: ['beds', 'transport', 'meals'],
        stay_ids: [STAY],
        plan_item_ids: [TRAIN],
      }),
    )
    expect(onClose).toHaveBeenCalled()
  })

  it('records a deposit with the balance due, and refuses paying more than the total', async () => {
    const user = userEvent.setup()
    vi.mocked(api.createPackage).mockResolvedValue(pkg({ paid_amount: 300 }))
    renderSheet()
    await user.type(screen.getByLabelText('Name'), 'Tour')
    await user.type(screen.getByLabelText('Total price (EUR)'), '1200')
    await user.click(screen.getByRole('button', { name: 'Deposit paid' }))
    await user.type(screen.getByLabelText('Paid so far'), '2000')
    await user.click(screen.getByRole('button', { name: 'Next: what it covers' }))
    expect(screen.getByRole('alert')).toHaveTextContent('between 0 and the total')

    await user.clear(screen.getByLabelText('Paid so far'))
    await user.type(screen.getByLabelText('Paid so far'), '300')
    await user.type(screen.getByLabelText('Balance due'), '2026-11-15')
    await user.click(screen.getByRole('button', { name: 'Next: what it covers' }))
    await user.click(screen.getByRole('button', { name: 'Save package' }))
    await waitFor(() =>
      expect(api.createPackage).toHaveBeenCalledWith(
        'trip-1',
        expect.objectContaining({ total_cost: 1200, paid_amount: 300, balance_due: '2026-11-15' }),
      ),
    )
  })

  it('edits keep the current links, and delete asks first', async () => {
    const user = userEvent.setup()
    vi.mocked(api.deletePackage).mockResolvedValue()
    renderSheet(pkg({ start_date: '2026-11-29', end_date: '2026-11-30' }))
    await user.click(screen.getByRole('button', { name: 'Next: what it covers' }))
    expect(screen.getByRole('checkbox', { name: /4x4 to Azouega/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Rosso crossing/ })).not.toBeChecked()

    await user.click(screen.getByRole('button', { name: /Details/ }))
    await user.click(screen.getByRole('button', { name: 'Delete package' }))
    expect(api.deletePackage).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(api.deletePackage).toHaveBeenCalledWith('trip-1', 'pkg-1'))
  })
})

describe('package surfaces', () => {
  it('Money lists the package as one line with its status', async () => {
    render(
      <MemoryRouter>
        <MoneyPackages
          trip={{ id: 'trip-1', start_date: '2026-11-18', end_date: '2026-12-09' } as api.Trip}
          onChanged={() => {}}
        />
      </MemoryRouter>,
    )
    const line = await screen.findByRole('button', { name: 'Edit package Mauritania Round 18' })
    expect(within(line).getByText('Paid')).toBeInTheDocument()
    expect(within(line).getByText('Beds · Transport · Meals')).toBeInTheDocument()
    expect(within(line).getByText(/2 items on those days/)).toBeInTheDocument()
  })

  it('shows a part-paid package with what is left and when', async () => {
    vi.mocked(api.fetchPackages).mockResolvedValue([
      pkg({ paid_amount: 300, balance_due: '2026-11-15' }),
    ])
    render(
      <MemoryRouter>
        <MoneyPackages trip={{ id: 'trip-1' } as api.Trip} onChanged={() => {}} />
      </MemoryRouter>,
    )
    expect(await screen.findByText('€300 paid · €900 left by 15 Nov')).toBeInTheDocument()
  })

  it('a covered day shows the banner; other days do not', async () => {
    const { unmount } = render(
      <MemoryRouter>
        <PackageBanner tripId="trip-1" date="2026-12-03" />
      </MemoryRouter>,
    )
    expect(
      await screen.findByRole('link', {
        name: /Part of Mauritania Round 18: Day 5 of 8 · beds, transport, meals included · paid/,
      }),
    ).toHaveAttribute('href', '/trips/trip-1/budget')
    unmount()
    render(
      <MemoryRouter>
        <PackageBanner tripId="trip-1" date="2026-11-20" />
      </MemoryRouter>,
    )
    await waitFor(() => expect(api.fetchPackages).toHaveBeenCalled())
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('the details picker moves an item into a package', async () => {
    const user = userEvent.setup()
    vi.mocked(api.updatePackage).mockResolvedValue(pkg({ plan_item_ids: [TRAIN, CROSSING] }))
    render(
      <PackagePicker
        item={{
          id: CROSSING,
          trip_id: 'trip-1',
          title: 'Rosso crossing',
          sort_order: 0,
          status: 'planned',
        }}
        date="2026-11-29"
      />,
    )
    const select = await screen.findByLabelText('Included in')
    expect(select).toHaveValue('')
    await user.selectOptions(select, 'pkg-1')
    await waitFor(() =>
      expect(api.updatePackage).toHaveBeenCalledWith('trip-1', 'pkg-1', {
        plan_item_ids: [TRAIN, CROSSING],
      }),
    )
    await waitFor(() => expect(screen.getByLabelText('Included in')).toHaveValue('pkg-1'))
  })
})

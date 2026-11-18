import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import * as api from '../lib/api'
import { importId, parseProgram, planImport } from './importProgram'
import ImportProgramPage from './ImportProgramPage'

vi.mock('../lib/api', async (orig) => ({
  ...(await orig<typeof import('../lib/api')>()),
  fetchDay: vi.fn(),
  setDayTitle: vi.fn(),
  createPlanItem: vi.fn(),
  createStay: vi.fn(),
  createTodo: vi.fn(),
}))

const replaceDay = vi.fn()
vi.mock('./useTripShell', () => ({
  useTripShell: () => ({
    trip: { id: 'trip-1', name: 'Gana', start_date: '2026-12-27', end_date: '2026-12-29' },
    tripDays: { dates: [], days: [], error: false, replaceDay },
  }),
}))

const program = {
  title: '100 Rota',
  days: [
    {
      day: 1,
      title: 'Accra',
      items: [
        { title: 'Makola Market', location: 'Accra' },
        {
          title: 'Accra → Cape Coast',
          kind: 'transport',
          origin: 'Accra',
          destination: 'Cape Coast',
          booking_status: 'paid',
        },
      ],
    },
    { day: 4, title: 'Kakum', items: [{ title: 'Canopy walk' }] },
  ],
  stays: [{ day: 1, nights: 2, name: 'Hotel em Osu', location: 'Osu' }],
  todos: [{ title: 'Visto do Benim', due: '2026-12-10' }],
}

describe('parseProgram', () => {
  it('accepts a valid programme', () => {
    expect(parseProgram(JSON.stringify(program)).errors).toEqual([])
  })

  it('explains what is wrong', () => {
    expect(parseProgram('not json').errors[0]).toMatch(/valid JSON/)
    expect(parseProgram('{}').errors[0]).toMatch(/"days"/)
    const bad = parseProgram(
      JSON.stringify({
        days: [{ items: [{ title: '', time: '9am', kind: 'party' }] }],
        stays: [{ name: 'X', nights: 0, day: 1 }],
        todos: [{ title: 'T', due: 'soon' }],
      }),
    ).errors
    expect(bad).toEqual([
      'Day entry 1: give "day" (1, 2, …) or "date".',
      'Day entry 1, item 1: needs a title.',
      'Day entry 1, item 1: time must be HH:MM.',
      'Day entry 1, item 1: kind must be activity, transport, food or note.',
      'Stay 1: nights must be 1 or more.',
      'To-do 1: due must be YYYY-MM-DD.',
    ])
  })
})

describe('planImport', () => {
  it('puts day 1 on the trip start and marks days outside the trip', () => {
    const p = planImport(parseProgram(JSON.stringify(program)).program!, '2026-12-27', '2026-12-29')
    expect(p.days.map((d) => [d.date, d.inTrip])).toEqual([
      ['2026-12-27', true],
      ['2026-12-30', false],
    ])
    const [visit, ride] = p.days[0].items
    expect(visit).toMatchObject({
      title: 'Makola Market',
      kind: 'activity',
      location: 'Accra',
      booking_status: 'none',
    })
    expect(ride).toMatchObject({
      kind: 'transport',
      origin: 'Accra',
      destination: 'Cape Coast',
      location: null,
      booking_status: 'paid',
    })
    expect(p.stays[0].input).toMatchObject({
      check_in: '2026-12-27',
      check_out: '2026-12-29',
      booking_status: 'booked',
      paid: false,
    })
    expect(p.todos[0]).toEqual({ title: 'Visto do Benim', note: '', due_date: '2026-12-10' })
  })

  it('keeps a duration without a start time in the note (the API needs both)', () => {
    const p = planImport(
      {
        days: [
          {
            day: 1,
            items: [
              { title: 'Ride', kind: 'transport', duration: '4h', note: 'Via Aflao.' },
              { title: 'Walk', time: '09:00', duration: '2h' },
            ],
          },
        ],
      },
      '2026-12-26',
      '2027-01-11',
    )
    expect(p.days[0].items[0]).toMatchObject({ duration: null, note: 'Duration: 4h. Via Aflao.' })
    expect(p.days[0].items[1]).toMatchObject({ start_time: '09:00', duration: '2h' })
  })

  it('makes the same id for the same row, and different ids otherwise', async () => {
    const a = await importId('trip-1', 'day-1-item-0')
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(await importId('trip-1', 'day-1-item-0')).toBe(a)
    expect(await importId('trip-1', 'day-1-item-1')).not.toBe(a)
    expect(await importId('trip-2', 'day-1-item-0')).not.toBe(a)
  })
})

describe('ImportProgramPage', () => {
  it('previews, then imports only what falls in the trip, with stable ids', async () => {
    const user = userEvent.setup()
    vi.mocked(api.fetchDay).mockImplementation(
      async (_t, date) => ({ id: `day-${date}`, date, stays: [], plan_items: [] }) as never,
    )
    vi.mocked(api.setDayTitle).mockResolvedValue('Accra')
    vi.mocked(api.createPlanItem).mockResolvedValue({} as never)
    vi.mocked(api.createStay).mockResolvedValue({} as never)
    vi.mocked(api.createTodo).mockResolvedValue({} as never)

    render(
      <MemoryRouter>
        <ImportProgramPage />
      </MemoryRouter>,
    )
    const box = screen.getByLabelText('Programme (JSON)')
    await user.click(box)
    await user.paste(JSON.stringify(program))

    expect(screen.getByText(/1 day · 2 plan items · 1 stays · 1 to-dos/)).toBeInTheDocument()
    expect(screen.getByText('Outside your trip dates — skipped')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Import into this trip' }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Added or updated 5 things'),
    )

    expect(api.setDayTitle).toHaveBeenCalledWith('trip-1', '2026-12-27', 'Accra')
    expect(api.createPlanItem).toHaveBeenCalledTimes(2)
    expect(api.createPlanItem).toHaveBeenCalledWith(
      'trip-1',
      expect.objectContaining({
        title: 'Makola Market',
        day_id: 'day-2026-12-27',
        id: await importId('trip-1', 'day-1-item-0'),
      }),
    )
    expect(api.createStay).toHaveBeenCalledWith(
      'trip-1',
      expect.objectContaining({ name: 'Hotel em Osu', id: await importId('trip-1', 'stay-0') }),
    )
    expect(api.createTodo).toHaveBeenCalledWith(
      'trip-1',
      expect.objectContaining({ title: 'Visto do Benim', id: await importId('trip-1', 'todo-0') }),
    )
    expect(replaceDay).toHaveBeenCalled()
  })

  it('reports a stay that overlaps an existing one and carries on', async () => {
    const user = userEvent.setup()
    vi.mocked(api.fetchDay).mockImplementation(
      async (_t, date) => ({ id: `day-${date}`, date, stays: [], plan_items: [] }) as never,
    )
    vi.mocked(api.createStay).mockRejectedValue(new api.StayOverlapError('overlap'))
    render(
      <MemoryRouter>
        <ImportProgramPage />
      </MemoryRouter>,
    )
    await user.click(screen.getByLabelText('Programme (JSON)'))
    await user.paste(JSON.stringify(program))
    await user.click(screen.getByRole('button', { name: 'Import into this trip' }))
    expect(await screen.findByText(/overlaps a stay you already have/)).toBeInTheDocument()
    expect(api.createTodo).toHaveBeenCalled()
  })
})

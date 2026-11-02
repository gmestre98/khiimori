import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { TripJournalPage } from './TripJournalPage'
import * as api from '../lib/api'
import type { Day, Trip } from '../lib/api'

const trip: Trip = {
  id: 'trip-1',
  owner_id: 'u',
  name: 'Test Trip',
  destinations: [],
  start_date: '2026-06-01',
  end_date: '2026-06-02',
  base_currency: 'EUR',
  cover: '',
  status: 'active',
  created_at: '',
  updated_at: '',
  is_current: false,
}

vi.mock('./useTripShell', () => ({ useTripShell: () => ({ trip }) }))
vi.mock('../lib/api', async (importOriginal) => {
  const orig = await importOriginal<typeof api>()
  return { ...orig, fetchDay: vi.fn(), fetchJournalEntry: vi.fn(), listPhotos: vi.fn() }
})

function makeDay(date: string, index: number): Day {
  return {
    id: `day-${index}`,
    trip_id: 'trip-1',
    date,
    index,
    notes: '',
    stays: [],
    plan_items:
      index === 0
        ? [
            {
              id: 'p1',
              trip_id: 'trip-1',
              title: 'Gorée',
              location: 'Gorée, Dakar, Senegal',
              status: 'done',
              sort_order: 0,
            },
          ]
        : [],
  }
}

beforeEach(() => {
  vi.mocked(api.fetchDay).mockImplementation(async (_t, date) =>
    makeDay(date, date === '2026-06-01' ? 0 : 1),
  )
  vi.mocked(api.fetchJournalEntry).mockImplementation(async (_t, dayId) => {
    if (dayId !== 'day-0') throw new api.JournalEntryNotFoundError()
    return {
      id: 'e',
      day_id: 'day-0',
      author_id: 'u',
      body: 'Ferry at dawn.',
      created_at: '',
      updated_at: '',
    }
  })
  vi.mocked(api.listPhotos).mockResolvedValue([])
})
afterEach(cleanup)

describe('TripJournalPage', () => {
  it('shows written days in a strip and the travelogue entries', async () => {
    render(
      <MemoryRouter>
        <TripJournalPage />
      </MemoryRouter>,
    )
    expect(await screen.findByText('1 of 2 days written')).toBeInTheDocument()
    const strip = screen.getByRole('list', { name: 'Days written' })
    expect(within(strip).getByText('Day 1: written')).toBeInTheDocument()
    expect(within(strip).getByText('Day 2: not written')).toBeInTheDocument()
    const entry = screen.getByRole('article', { name: 'Day 1' })
    expect(within(entry).getByRole('heading', { name: 'Gorée' })).toBeInTheDocument()
    expect(within(entry).getByText('Ferry at dawn.')).toBeInTheDocument()
    // "What happened" is built from done items.
    expect(within(entry).getByText('Gorée', { selector: 'li' })).toBeInTheDocument()
  })

  it('switches between Days and Photos views', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <TripJournalPage />
      </MemoryRouter>,
    )
    await screen.findByText('1 of 2 days written')
    await user.click(screen.getByRole('button', { name: 'Photos' }))
    expect(screen.getByRole('button', { name: 'Photos' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/No photos yet/)).toBeInTheDocument()
  })
})

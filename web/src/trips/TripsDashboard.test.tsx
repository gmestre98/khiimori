import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { TripsDashboard } from './TripsDashboard'
import type { TripsResponse } from '../lib/api'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function mockFetchTrips(response: TripsResponse) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(response), { status: 200 }),
  )
}

const emptyResponse: TripsResponse = { current: [], upcoming: [], past: [] }

const tripA = {
  id: 'trip-1',
  owner_id: 'user-1',
  name: 'Japan 2024',
  destinations: ['Tokyo', 'Kyoto'],
  start_date: '2024-04-01',
  end_date: '2024-04-14',
  base_currency: 'EUR',
  cover: '',
  status: 'active',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  is_current: false,
}

const tripB = {
  ...tripA,
  id: 'trip-2',
  name: 'Portugal 2025',
  destinations: ['Lisbon'],
  start_date: '2025-06-01',
  end_date: '2025-06-10',
  is_current: false,
}

describe('TripsDashboard', () => {
  it('renders bucket headings even when all buckets are empty', async () => {
    mockFetchTrips(emptyResponse)

    render(<TripsDashboard />)

    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument())

    expect(screen.getByRole('region', { name: /current/i })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /upcoming/i })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /past/i })).toBeInTheDocument()
  })

  it('shows empty-state messages when buckets are empty', async () => {
    mockFetchTrips(emptyResponse)

    render(<TripsDashboard />)

    await waitFor(() => screen.getByText(/no current trip/i))
    expect(screen.getByText(/no upcoming trips/i)).toBeInTheDocument()
    expect(screen.getByText(/no past trips/i)).toBeInTheDocument()
  })

  it('renders trip cards with name, destinations, and dates', async () => {
    mockFetchTrips({ current: [tripA], upcoming: [tripB], past: [] })

    render(<TripsDashboard />)

    await waitFor(() => screen.getByText('Japan 2024'))

    expect(screen.getByText('Japan 2024')).toBeInTheDocument()
    expect(screen.getByText('Tokyo, Kyoto')).toBeInTheDocument()
    expect(screen.getByText('2024-04-01 – 2024-04-14')).toBeInTheDocument()

    expect(screen.getByText('Portugal 2025')).toBeInTheDocument()
    expect(screen.getByText('Lisbon')).toBeInTheDocument()
  })

  it('shows a cover image when cover is set', async () => {
    const tripWithCover = { ...tripA, cover: 'https://example.com/cover.jpg' }
    mockFetchTrips({ current: [tripWithCover], upcoming: [], past: [] })

    render(<TripsDashboard />)

    await waitFor(() => screen.getByText('Japan 2024'))

    const img = document.querySelector('.trip-card-cover') as HTMLImageElement
    expect(img).toHaveAttribute('src', 'https://example.com/cover.jpg')
  })

  it('shows an error message on fetch failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'))

    render(<TripsDashboard />)

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/could not load trips/i),
    )
  })

  it('shows loading state initially', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}))

    render(<TripsDashboard />)

    expect(screen.getByText(/loading trips/i)).toBeInTheDocument()
  })
})

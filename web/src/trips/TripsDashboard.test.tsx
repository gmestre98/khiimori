import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
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

    render(
      <MemoryRouter>
        <TripsDashboard />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument())

    expect(screen.getByRole('region', { name: /current/i })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /upcoming/i })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /past/i })).toBeInTheDocument()
  })

  it('shows empty-state messages when buckets are empty', async () => {
    mockFetchTrips(emptyResponse)

    render(
      <MemoryRouter>
        <TripsDashboard />
      </MemoryRouter>,
    )

    await waitFor(() => screen.getByText(/no current trip/i))
    expect(screen.getByText(/no upcoming trips/i)).toBeInTheDocument()
    expect(screen.getByText(/no past trips/i)).toBeInTheDocument()
  })

  it('renders trip cards with name, destinations, and dates', async () => {
    mockFetchTrips({ current: [tripA], upcoming: [tripB], past: [] })

    render(
      <MemoryRouter>
        <TripsDashboard />
      </MemoryRouter>,
    )

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

    render(
      <MemoryRouter>
        <TripsDashboard />
      </MemoryRouter>,
    )

    await waitFor(() => screen.getByText('Japan 2024'))

    const img = document.querySelector('.trip-card-cover') as HTMLImageElement
    expect(img).toHaveAttribute('src', 'https://example.com/cover.jpg')
  })

  it('shows an error message on fetch failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'))

    render(
      <MemoryRouter>
        <TripsDashboard />
      </MemoryRouter>,
    )

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/could not load trips/i),
    )
  })

  it('renders Archive and Delete buttons on each trip card', async () => {
    mockFetchTrips({ current: [], upcoming: [tripA], past: [] })

    render(
      <MemoryRouter>
        <TripsDashboard />
      </MemoryRouter>,
    )

    await waitFor(() => screen.getByText('Japan 2024'))

    expect(screen.getByRole('button', { name: /archive japan 2024/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete japan 2024/i })).toBeInTheDocument()
  })

  it('opens archive confirmation modal and dismisses on cancel', async () => {
    mockFetchTrips({ current: [], upcoming: [tripA], past: [] })

    render(
      <MemoryRouter>
        <TripsDashboard />
      </MemoryRouter>,
    )

    await waitFor(() => screen.getByText('Japan 2024'))
    fireEvent.click(screen.getByRole('button', { name: /archive japan 2024/i }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/archive "japan 2024"/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Japan 2024')).toBeInTheDocument()
  })

  it('opens delete confirmation modal with cascade warning', async () => {
    mockFetchTrips({ current: [], upcoming: [tripA], past: [] })

    render(
      <MemoryRouter>
        <TripsDashboard />
      </MemoryRouter>,
    )

    await waitFor(() => screen.getByText('Japan 2024'))
    fireEvent.click(screen.getByRole('button', { name: /delete japan 2024/i }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument()
    expect(screen.getByText(/all days and associated data/i)).toBeInTheDocument()
  })

  it('archives a trip: removes from active buckets and shows Past/archived section', async () => {
    mockFetchTrips({ current: [], upcoming: [tripA], past: [] })

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ current: [], upcoming: [tripA], past: [] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...tripA, status: 'archived' }), { status: 200 }),
      )

    render(
      <MemoryRouter>
        <TripsDashboard />
      </MemoryRouter>,
    )

    await waitFor(() => screen.getByText('Japan 2024'))
    fireEvent.click(screen.getByRole('button', { name: /archive japan 2024/i }))
    fireEvent.click(screen.getByRole('button', { name: /^archive$/i }))

    await waitFor(() => expect(screen.getByRole('region', { name: /past\/archived/i })).toBeInTheDocument())
    expect(screen.getByRole('region', { name: /upcoming/i })).not.toHaveTextContent('Japan 2024')
  })

  it('deletes a trip: removes from dashboard after confirmation', async () => {
    mockFetchTrips({ current: [], upcoming: [tripA], past: [] })

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ current: [], upcoming: [tripA], past: [] }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    render(
      <MemoryRouter>
        <TripsDashboard />
      </MemoryRouter>,
    )

    await waitFor(() => screen.getByText('Japan 2024'))
    fireEvent.click(screen.getByRole('button', { name: /delete japan 2024/i }))
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))

    await waitFor(() => expect(screen.queryByText('Japan 2024')).not.toBeInTheDocument())
  })

  it('closes modal on Escape key press', async () => {
    mockFetchTrips({ current: [], upcoming: [tripA], past: [] })

    render(
      <MemoryRouter>
        <TripsDashboard />
      </MemoryRouter>,
    )

    await waitFor(() => screen.getByText('Japan 2024'))
    fireEvent.click(screen.getByRole('button', { name: /delete japan 2024/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows loading state initially', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}))

    render(
      <MemoryRouter>
        <TripsDashboard />
      </MemoryRouter>,
    )

    expect(screen.getByText(/loading trips/i)).toBeInTheDocument()
  })
})

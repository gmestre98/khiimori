import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TripsDashboard } from './TripsDashboard'
import type { PendingInvitation, TripsResponse } from '../lib/api'
import { writeCache } from '../lib/resourceCache'
import { cacheKeys } from '../lib/cacheKeys'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// jsonResponse builds a fresh Response per call — bodies are single-use, so the
// dashboard's several mount requests can't share one instance.
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(body === null ? null : JSON.stringify(body), { status })
}

// urlOf normalizes the fetch input to a string URL for routing.
function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return (input as Request).url
}

// mockFetchTrips routes by URL so the mock is robust to the dashboard fetching
// trips *and* the invitation inbox (GET /invitations) on mount.
function mockFetchTrips(response: TripsResponse, invitations: PendingInvitation[] = []) {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    if (urlOf(input as RequestInfo | URL).includes('/invitations')) {
      return Promise.resolve(jsonResponse({ invitations }))
    }
    return Promise.resolve(jsonResponse(response))
  })
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
  it('renders tab buttons for all three buckets', async () => {
    mockFetchTrips(emptyResponse)

    render(
      <MemoryRouter>
        <TripsDashboard />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument())

    expect(screen.getByRole('tab', { name: /current/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /upcoming/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /past/i })).toBeInTheDocument()
  })

  it('renders cached trips instantly, before the network responds (M11.1)', async () => {
    // Seed the on-device cache, then make the network hang. The dashboard should
    // paint the cached trip with no loading spinner — the instant-render path
    // that hides the backend cold start.
    await writeCache(cacheKeys.trips(), { current: [], upcoming: [tripB], past: [] })
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>(() => {}))

    render(
      <MemoryRouter>
        <TripsDashboard />
      </MemoryRouter>,
    )

    // Cached content appears without waiting for fetch; no loading text shows.
    await waitFor(() => expect(screen.getByText('Portugal 2025')).toBeInTheDocument())
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
  })

  it('keeps showing cached trips when the refresh fails (M11.1)', async () => {
    await writeCache(cacheKeys.trips(), { current: [], upcoming: [tripB], past: [] })
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))

    render(
      <MemoryRouter>
        <TripsDashboard />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('Portugal 2025')).toBeInTheDocument())
    // Non-destructive: a failed refresh does not replace cached data with an error.
    expect(screen.queryByText(/could not load/i)).not.toBeInTheDocument()
  })

  it('shows empty-state messages when buckets are empty', async () => {
    mockFetchTrips(emptyResponse)

    render(
      <MemoryRouter>
        <TripsDashboard />
      </MemoryRouter>,
    )

    // Current tab is default
    await waitFor(() => screen.getByText(/no current trip/i))

    // Upcoming tab
    fireEvent.click(screen.getByRole('tab', { name: /upcoming/i }))
    expect(screen.getByText(/no upcoming trips/i)).toBeInTheDocument()

    // Past tab
    fireEvent.click(screen.getByRole('tab', { name: /past/i }))
    expect(screen.getByText(/no past trips/i)).toBeInTheDocument()
  })

  it('renders trip cards with name, destinations, and dates on the right tabs', async () => {
    mockFetchTrips({ current: [tripA], upcoming: [tripB], past: [] })

    render(
      <MemoryRouter>
        <TripsDashboard />
      </MemoryRouter>,
    )

    // tripA is in the current bucket (is_current: false → shows as grid card on Current tab)
    await waitFor(() => screen.getByText('Japan 2024'))
    expect(screen.getByText(/tokyo.*kyoto/i)).toBeInTheDocument()
    expect(screen.getByText('Apr 01 – Apr 14, 2024')).toBeInTheDocument()

    // tripB is on the Upcoming tab
    fireEvent.click(screen.getByRole('tab', { name: /upcoming/i }))
    expect(screen.getByText('Portugal 2025')).toBeInTheDocument()
    expect(screen.getByText('Lisbon')).toBeInTheDocument()
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

    // Navigate to Upcoming tab to see tripA
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('tab', { name: /upcoming/i }))
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

    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('tab', { name: /upcoming/i }))
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

    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('tab', { name: /upcoming/i }))
    await waitFor(() => screen.getByText('Japan 2024'))

    fireEvent.click(screen.getByRole('button', { name: /delete japan 2024/i }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument()
  })

  it('archives a trip: removes from upcoming and appears on Past tab', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = urlOf(input as RequestInfo | URL)
      if (url.includes('/invitations')) return Promise.resolve(jsonResponse({ invitations: [] }))
      if (url.includes('/archive')) {
        return Promise.resolve(jsonResponse({ ...tripA, status: 'archived' }))
      }
      return Promise.resolve(jsonResponse({ current: [], upcoming: [tripA], past: [] }))
    })

    render(
      <MemoryRouter>
        <TripsDashboard />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('tab', { name: /upcoming/i }))
    await waitFor(() => screen.getByText('Japan 2024'))

    fireEvent.click(screen.getByRole('button', { name: /archive japan 2024/i }))
    fireEvent.click(screen.getByRole('button', { name: /^archive$/i }))

    // Trip removed from upcoming tab
    await waitFor(() => expect(screen.queryByText('Japan 2024')).not.toBeInTheDocument())

    // Appears on Past tab (moved to local archived state)
    fireEvent.click(screen.getByRole('tab', { name: /past/i }))
    expect(screen.getByText('Japan 2024')).toBeInTheDocument()
  })

  it('deletes a trip: removes from dashboard after confirmation', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = urlOf(input as RequestInfo | URL)
      const method = (init?.method ?? 'GET').toUpperCase()
      if (url.includes('/invitations')) return Promise.resolve(jsonResponse({ invitations: [] }))
      if (method === 'DELETE') return Promise.resolve(jsonResponse(null, 204))
      return Promise.resolve(jsonResponse({ current: [], upcoming: [tripA], past: [] }))
    })

    render(
      <MemoryRouter>
        <TripsDashboard />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('tab', { name: /upcoming/i }))
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

    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('tab', { name: /upcoming/i }))
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

  it('shows a pending invitation and joins the trip on accept', async () => {
    const invite: PendingInvitation = {
      id: 'inv-1',
      trip_id: 'trip-9',
      trip_name: 'Shared Trip',
      role: 'viewer',
    }
    let accepted = false
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = urlOf(input as RequestInfo | URL)
      const method = (init?.method ?? 'GET').toUpperCase()
      if (url.includes('/invitations') && url.includes('/accept') && method === 'POST') {
        accepted = true
        return Promise.resolve(
          jsonResponse({ trip_id: 'trip-9', role: 'viewer', status: 'accepted' }),
        )
      }
      if (url.includes('/invitations')) {
        return Promise.resolve(jsonResponse({ invitations: accepted ? [] : [invite] }))
      }
      return Promise.resolve(jsonResponse(emptyResponse))
    })

    render(
      <MemoryRouter>
        <TripsDashboard />
      </MemoryRouter>,
    )

    // The invitation surfaces in-app without any email.
    await waitFor(() => screen.getByText('Shared Trip'))
    const acceptBtn = screen.getByRole('button', { name: /accept invitation to shared trip/i })

    fireEvent.click(acceptBtn)

    // Accepting joins the trip and clears the invitation from the inbox.
    await waitFor(() => expect(accepted).toBe(true))
    await waitFor(() => expect(screen.queryByText('Shared Trip')).not.toBeInTheDocument())
  })

  it('declines a pending invitation and clears it from the inbox', async () => {
    const invite: PendingInvitation = {
      id: 'inv-1',
      trip_id: 'trip-9',
      trip_name: 'Shared Trip',
      role: 'viewer',
    }
    let declined = false
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = urlOf(input as RequestInfo | URL)
      const method = (init?.method ?? 'GET').toUpperCase()
      if (url.includes('/invitations') && url.includes('/decline') && method === 'POST') {
        declined = true
        return Promise.resolve(new Response(null, { status: 204 }))
      }
      if (url.includes('/invitations')) {
        return Promise.resolve(jsonResponse({ invitations: declined ? [] : [invite] }))
      }
      return Promise.resolve(jsonResponse(emptyResponse))
    })

    render(
      <MemoryRouter>
        <TripsDashboard />
      </MemoryRouter>,
    )

    await waitFor(() => screen.getByText('Shared Trip'))
    fireEvent.click(screen.getByRole('button', { name: /decline invitation to shared trip/i }))

    // Declining removes the invitation from the inbox without joining the trip.
    await waitFor(() => expect(declined).toBe(true))
    await waitFor(() => expect(screen.queryByText('Shared Trip')).not.toBeInTheDocument())
  })
})

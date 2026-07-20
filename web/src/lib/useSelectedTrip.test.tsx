import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useSelectedTrip } from './useSelectedTrip'
import type { Trip, TripsResponse } from './api'

// fetchTrips is mocked so the hook resolves synchronously against fixed data.
const fetchTrips = vi.fn()
vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api')
  return { ...actual, fetchTrips: (...args: unknown[]) => fetchTrips(...args) }
})

function trip(id: string, name: string, is_current = false): Trip {
  return {
    id,
    owner_id: 'u',
    name,
    destinations: [],
    start_date: '2026-07-01',
    end_date: '2026-07-05',
    base_currency: 'EUR',
    cover: '',
    status: 'planning',
    created_at: '',
    updated_at: '',
    is_current,
  }
}

const response: TripsResponse = {
  current: [trip('japan', 'Japan', true)],
  upcoming: [trip('portugal', 'Portugal')],
  past: [trip('morocco', 'Morocco')],
}

beforeEach(() => {
  localStorage.clear()
  fetchTrips.mockReset().mockResolvedValue(response)
})
afterEach(cleanup)

describe('useSelectedTrip', () => {
  it('defaults to the current trip when nothing is stored', async () => {
    const { result } = renderHook(() => useSelectedTrip())
    await waitFor(() => expect(result.current.selectedTrip?.name).toBe('Japan'))
  })

  it('restores a previously stored pick', async () => {
    localStorage.setItem('khiimori.selectedTripId', 'morocco')
    const { result } = renderHook(() => useSelectedTrip())
    await waitFor(() => expect(result.current.selectedTrip?.name).toBe('Morocco'))
  })

  it('falls back to the default when the stored trip no longer exists', async () => {
    localStorage.setItem('khiimori.selectedTripId', 'deleted-trip')
    const { result } = renderHook(() => useSelectedTrip())
    await waitFor(() => expect(result.current.selectedTrip?.name).toBe('Japan'))
  })

  it('selectTrip switches the trip and persists the choice', async () => {
    const { result } = renderHook(() => useSelectedTrip())
    await waitFor(() => expect(result.current.selectedTrip?.name).toBe('Japan'))
    act(() => result.current.selectTrip('portugal'))
    await waitFor(() => expect(result.current.selectedTrip?.name).toBe('Portugal'))
    expect(localStorage.getItem('khiimori.selectedTripId')).toBe('portugal')
  })

  it('follows the trip in the URL over the stored pick', async () => {
    localStorage.setItem('khiimori.selectedTripId', 'morocco')
    const { result } = renderHook(() => useSelectedTrip('portugal'))
    await waitFor(() => expect(result.current.selectedTrip?.name).toBe('Portugal'))
    expect(localStorage.getItem('khiimori.selectedTripId')).toBe('portugal')
  })
})

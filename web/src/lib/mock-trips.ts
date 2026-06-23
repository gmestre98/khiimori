// Mock trip data for local development UI testing. Delete this file and the
// VITE_USE_MOCK_TRIPS env var when no longer needed.
import type { TripsResponse } from './api'

export const mockTripsResponse: TripsResponse = {
  current: [
    {
      id: 'mock-current-hellfest',
      owner_id: 'mock-user',
      name: 'Hellfest 2026',
      destinations: ['Nantes', 'Hellfest'],
      // Day 14 of the trip = today (2026-06-23), so start = 2026-06-10
      start_date: '2026-06-10',
      end_date: '2026-07-01',
      base_currency: 'EUR',
      cover: '',
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      is_current: true,
    },
  ],
  upcoming: [
    {
      id: 'mock-upcoming-mauritania',
      owner_id: 'mock-user',
      name: 'Mauritânia, Senegal & Gâmbia',
      destinations: ['Dakar', 'Saint Louis', 'Nouakchott', 'Chinguetti', 'Nouadhibou'],
      start_date: '2026-09-01',
      end_date: '2026-10-15',
      base_currency: 'EUR',
      cover: '',
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      is_current: false,
    },
  ],
  past: [
    {
      id: 'mock-past-copenhagen',
      owner_id: 'mock-user',
      name: 'Copenhaga & Hamburgo',
      destinations: ['Copenhaga', 'Hamburgo'],
      start_date: '2025-08-01',
      end_date: '2025-09-10',
      base_currency: 'EUR',
      cover: '',
      status: 'active',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
      is_current: false,
    },
  ],
}

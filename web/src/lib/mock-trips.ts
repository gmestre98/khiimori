// Mock trip data for local development UI testing. Delete this file and the
// VITE_USE_MOCK_TRIPS env var when no longer needed.
//
// Tuned to mirror the v1 design reference (docs/khiimori-v1/design): a current
// "Japan — Spring 2026" trip whose day 4 is "today", plus calmer Upcoming/Past
// cards. Dates are anchored to the real today so the live hero (day N / total)
// and the day view land on day 4 without manual date juggling.
import type { TripsResponse } from './api'

// isoDay returns today shifted by `offset` days as YYYY-MM-DD (local time).
function isoDay(offset: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// The current trip: 12 days, started 3 days ago so today is day 4 (Kyoto).
export const MOCK_CURRENT_TRIP_ID = 'mock-japan'
export const MOCK_TRIP_START = isoDay(-3)
export const MOCK_TRIP_END = isoDay(8)

export const mockTripsResponse: TripsResponse = {
  current: [
    {
      id: MOCK_CURRENT_TRIP_ID,
      owner_id: 'mock-user',
      name: 'Japan — Spring 2026',
      destinations: ['Tokyo', 'Kyoto', 'Osaka'],
      start_date: MOCK_TRIP_START,
      end_date: MOCK_TRIP_END,
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
      id: 'mock-upcoming-portugal',
      owner_id: 'mock-user',
      name: 'Portugal Roadtrip',
      destinations: ['Porto', 'Douro', 'Lisbon'],
      start_date: isoDay(50),
      end_date: isoDay(58),
      base_currency: 'EUR',
      cover: '',
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      is_current: false,
    },
    {
      id: 'mock-upcoming-iceland',
      owner_id: 'mock-user',
      name: 'Iceland Ring Road',
      destinations: ['Reykjavík', 'South Coast'],
      start_date: isoDay(120),
      end_date: isoDay(130),
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
      id: 'mock-past-morocco',
      owner_id: 'mock-user',
      name: 'Morocco',
      destinations: ['Marrakesh', 'Fez', 'Sahara'],
      start_date: isoDay(-260),
      end_date: isoDay(-252),
      base_currency: 'EUR',
      cover: '',
      status: 'active',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
      is_current: false,
    },
    {
      id: 'mock-past-norway',
      owner_id: 'mock-user',
      name: 'Norway Fjords',
      destinations: ['Bergen', 'Geiranger'],
      start_date: isoDay(-360),
      end_date: isoDay(-354),
      base_currency: 'EUR',
      cover: '',
      status: 'active',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
      is_current: false,
    },
  ],
}

// Dev-only API mock. Delete alongside mock-trips.ts and the VITE_USE_MOCK_TRIPS
// env var when no longer needed.
//
// When VITE_USE_MOCK_TRIPS === 'true' this installs a window.fetch interceptor
// that serves canned JSON for every endpoint the UI reads, so the whole app can
// be driven (and the v1 design verified) without a backend or a real session.
// It is imported for its side effect from main.tsx behind the same env flag, so
// production builds never include this code path.
import { MOCK_CURRENT_TRIP_ID, MOCK_TRIP_START } from './mock-trips'

// dayIdForDate maps a YYYY-MM-DD to a stable synthetic day id. Day 4 (today) is
// the rich Kyoto day from the design; other days return a calmer skeleton.
function dayOffset(date: string): number {
  const start = new Date(MOCK_TRIP_START + 'T00:00:00').getTime()
  const d = new Date(date + 'T00:00:00').getTime()
  return Math.round((d - start) / 86_400_000)
}

const DAY4_ID = 'mock-day-4'

// addDays returns a YYYY-MM-DD offset from the given date.
function addDays(date: string, n: number): string {
  return new Date(new Date(date + 'T00:00:00Z').getTime() + n * 86_400_000)
    .toISOString()
    .slice(0, 10)
}

function richKyotoDay(date: string) {
  return {
    id: DAY4_ID,
    trip_id: MOCK_CURRENT_TRIP_ID,
    date,
    index: 3,
    notes: '',
    stays: [
      {
        id: 'stay-1',
        trip_id: MOCK_CURRENT_TRIP_ID,
        name: 'Hotel Mume',
        location: 'Gion district',
        check_in: addDays(date, -2),
        check_out: addDays(date, 2),
        cost: 300,
        paid: false,
      },
    ],
    plan_items: [
      {
        id: 'pi-1',
        trip_id: MOCK_CURRENT_TRIP_ID,
        day_id: DAY4_ID,
        title: 'Fushimi Inari Shrine',
        kind: 'activity',
        type: 'activities',
        start_time: '09:00',
        duration: '2h',
        location: 'Fushimi',
        cost: 0,
        sort_order: 1,
        status: 'active',
      },
      {
        id: 'pi-2',
        trip_id: MOCK_CURRENT_TRIP_ID,
        day_id: DAY4_ID,
        title: 'Nishiki Market lunch',
        kind: 'food',
        type: 'food',
        start_time: '12:30',
        location: 'Nishiki',
        cost: 14.2,
        sort_order: 2,
        status: 'active',
      },
      {
        id: 'pi-3',
        trip_id: MOCK_CURRENT_TRIP_ID,
        day_id: DAY4_ID,
        title: 'Tea ceremony (tour)',
        kind: 'activity',
        type: 'activities',
        start_time: '15:00',
        location: 'Higashiyama',
        booking_status: 'booked',
        cost: 29.0,
        sort_order: 3,
        status: 'active',
      },
      {
        id: 'pi-idea-1',
        trip_id: MOCK_CURRENT_TRIP_ID,
        day_id: DAY4_ID,
        title: "Walk the Philosopher's Path",
        kind: 'activity',
        type: 'activities',
        sort_order: 4,
        status: 'idea',
      },
      {
        id: 'pi-idea-2',
        trip_id: MOCK_CURRENT_TRIP_ID,
        day_id: DAY4_ID,
        title: 'Try a kissaten (old coffee house)',
        kind: 'food',
        type: 'food',
        sort_order: 5,
        status: 'idea',
      },
    ],
  }
}

function calmDay(date: string, offset: number) {
  return {
    id: `mock-day-${offset + 1}`,
    trip_id: MOCK_CURRENT_TRIP_ID,
    date,
    index: offset,
    notes: '',
    stays: [
      {
        id: `stay-${offset}`,
        trip_id: MOCK_CURRENT_TRIP_ID,
        name: 'Hotel Mume',
        location: 'Gion district',
        check_in: addDays(date, -offset),
        check_out: addDays(date, 5 - offset),
        cost: 0,
      },
    ],
    plan_items: [],
  }
}

const budgetRollup = {
  trip_total: 640,
  planned_trip_total: 1800,
  // Capitalized keys match the real backend's fixed categories (budget.Category*).
  by_category: { Stays: 320, Transport: 95, Food: 170, Activities: 55, Other: 0 },
  planned_by_category: { Stays: 700, Transport: 250, Food: 200, Activities: 450, Other: 200 },
  by_day: { [DAY4_ID]: 43.2 },
  planned_by_day: { [DAY4_ID]: 110 },
  by_day_category: { [DAY4_ID]: { Transport: 7, Food: 14.2, Activities: 29 } },
  // Upcoming (not-yet-happened) estimate: an unpaid stay + planned activities (M12.2).
  estimated_trip_total: 380,
  estimated_by_category: { Stays: 300, Activities: 65, Food: 15 },
  estimated_by_day: { [DAY4_ID]: 80 },
}

const profile = {
  id: 'mock-user',
  name: 'Gonçalo',
  email: 'goncalo@gmail.com',
  avatar: '',
  home_base: 'Lisbon',
  theme: 'light',
  default_currency: 'EUR',
  is_admin: true,
}

const sharingMembers = {
  members: [
    { id: 'm1', trip_id: MOCK_CURRENT_TRIP_ID, user_id: 'mock-user', role: 'owner' },
    { id: 'm2', trip_id: MOCK_CURRENT_TRIP_ID, user_id: 'maria', role: 'editor' },
    { id: 'm3', trip_id: MOCK_CURRENT_TRIP_ID, user_id: 'alex', role: 'viewer' },
  ],
}
const sharingInvites = {
  invitations: [
    {
      id: 'i1',
      trip_id: MOCK_CURRENT_TRIP_ID,
      email: 'sofia@gmail.com',
      role: 'viewer',
      status: 'sent',
    },
  ],
}

const journalEntry = {
  id: 'j1',
  day_id: DAY4_ID,
  body: {
    text: 'The orange torii gates went on forever. We got lost near the top but found the best ramen of the trip on the way down. Mood: tired + happy.',
  },
  rating: 9,
  weather: 'Sunny · 18°C',
  mood: 'Content',
}

const usage = { used_bytes: 320_000_000, cap_bytes: 1_073_741_824, near_cap: false, used_pct: 30 }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// route handlers, in priority order. Each entry: [RegExp, handler].
function resolve(path: string, method: string, search: string, body: unknown): Response | null {
  // /me — auth probe
  if (path === '/me') return json(profile)
  if (path === '/trips' && method === 'GET') return null // handled by fetchTrips' own mock branch

  // Single-location geocode proxy — powers the location field's live feedback.
  // Mimics a real geocoder: resolves anything with letters, 404s on gibberish
  // (no alphabetic characters) so the "couldn't place this" path is exercisable.
  if (path === '/geo/geocode') {
    const loc = new URLSearchParams(search).get('location') ?? ''
    if (!/[a-z]/i.test(loc)) return json({ error: 'location not found' }, 404)
    return json({ lat: 35.0116, lng: 135.7681 })
  }

  // Place autocomplete — returns a few plausible predictions built from the
  // typed input so the suggestions dropdown is exercisable in local dev.
  if (path === '/geo/autocomplete') {
    const input = (new URLSearchParams(search).get('input') ?? '').trim()
    if (input.length < 3) return json({ suggestions: [] })
    const suggestions = [
      { description: `${input}, Kyoto, Japan`, place_id: `mock-${input}-1` },
      { description: `${input} Station, Osaka, Japan`, place_id: `mock-${input}-2` },
      { description: `${input}, Tokyo, Japan`, place_id: `mock-${input}-3` },
    ]
    return json({ suggestions })
  }

  // Day route geo proxy
  if (path === '/geo/day-route') {
    return json({
      waypoints: [
        { lat: 34.967, lng: 135.772 },
        { lat: 35.005, lng: 135.765 },
        { lat: 34.998, lng: 135.78 },
      ],
    })
  }

  // /trips/:id/days/:date/journal/photos
  if (/\/trips\/[^/]+\/days\/[^/]+\/journal\/photos/.test(path)) {
    if (method === 'GET') return json({ photos: [] })
    return json({}, 200)
  }
  // /trips/:id/days/:date/journal
  if (/\/trips\/[^/]+\/days\/[^/]+\/journal$/.test(path)) {
    return json(journalEntry)
  }
  // /trips/:id/days/:date  (day fetch)
  const dayMatch = path.match(/^\/trips\/[^/]+\/days\/([0-9]{4}-[0-9]{2}-[0-9]{2})$/)
  if (dayMatch) {
    const date = dayMatch[1]
    const offset = dayOffset(date)
    return json(offset === 3 ? richKyotoDay(date) : calmDay(date, offset))
  }
  // backlog
  if (/\/plan-items\/backlog$/.test(path)) return json({ items: [] })
  // budget rollup
  if (/\/budget\/rollup$/.test(path)) return json(budgetRollup)
  // budget lines (writes)
  if (/\/budget-lines$/.test(path))
    return json({
      id: 'bl',
      trip_id: MOCK_CURRENT_TRIP_ID,
      day_id: null,
      category: 'food',
      planned_amount: 0,
      actual_amount: 0,
    })
  // stays (create/update) — echo the request body so the paid toggle, cost, and
  // other edits reflect immediately in the preview (M12.2).
  const stayMatch = path.match(/\/stays(?:\/([^/]+))?$/)
  if (stayMatch && (method === 'POST' || method === 'PATCH')) {
    const b = (body ?? {}) as Record<string, unknown>
    return json(
      { id: stayMatch[1] ?? b.id ?? 'stay-new', trip_id: MOCK_CURRENT_TRIP_ID, ...b },
      method === 'POST' ? 201 : 200,
    )
  }
  // sharing
  if (/\/memberships$/.test(path)) return json(sharingMembers)
  if (/\/invitations$/.test(path)) return json(sharingInvites)
  if (/\/usage$/.test(path)) return json(usage)

  // Default: empty OK so writes don't error.
  return json({}, 200)
}

export function installDevMock() {
  const realFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    try {
      const u = new URL(url, window.location.origin)
      // Only intercept API calls (anything that isn't a same-origin asset).
      const isApi =
        u.pathname.startsWith('/me') ||
        u.pathname.startsWith('/trips') ||
        u.pathname.startsWith('/geo')
      if (isApi) {
        let body: unknown = undefined
        if (typeof init?.body === 'string') {
          try {
            body = JSON.parse(init.body)
          } catch {
            body = undefined
          }
        }
        const res = resolve(u.pathname, method, u.search, body)
        if (res) return res
        if (u.pathname === '/trips') return realFetch(input as RequestInfo, init)
        return json({}, 200)
      }
    } catch {
      // fall through to real fetch
    }
    return realFetch(input as RequestInfo, init)
  }
  console.info('[dev-mock] API mock installed (VITE_USE_MOCK_TRIPS=true)')
}

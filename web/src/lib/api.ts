// Centralised API access for the web app. The one job of this module is to be
// the single place that knows where the API lives, so the base URL is set once
// (from the environment) rather than scattered across feature code.

// Local development default, used when VITE_API_BASE_URL is unset (e.g. a plain
// `npm run dev` with no .env). It points at the API's default local port
// (backend PORT=8080). Production never relies on this: the real URL is injected
// at build time via VITE_API_BASE_URL (see .env.example and the CI deploy job),
// so there is no hardcoded production URL anywhere in the source (epic AC4).
const LOCAL_DEFAULT_BASE_URL = 'http://localhost:8080'

// apiBaseURL is the resolved API base URL — read once from the build-time env
// var, falling back to the local default. `||` (not `??`) so an empty/unset
// value both fall back: an empty VITE_API_BASE_URL would otherwise leave a blank
// base and turn API calls into same-origin (Hosting) paths. Trailing slashes
// are trimmed so apiUrl can join paths without producing a double slash.
export const apiBaseURL: string = (
  import.meta.env.VITE_API_BASE_URL?.trim() || LOCAL_DEFAULT_BASE_URL
).replace(/\/+$/, '')

// apiUrl joins an API path onto the configured base URL. Pass a leading-slash
// path (e.g. "/healthz"); a missing leading slash is tolerated.
export function apiUrl(path: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${apiBaseURL}${suffix}`
}

// healthPath is the API endpoint the browser probes. It is /readyz, NOT
// /healthz: Cloud Run does not route external traffic to the liveness-probe
// path (/healthz returns 404 from the edge before reaching the app), so a
// browser can only reach /readyz — which also pings the DB, making a 200 a
// stronger "the API + its database are live" signal. The deployed e2e smoke
// (e2e/smoke.sh) probes /readyz for the same reason.
const healthPath = '/readyz'

// HealthStatus is the parsed shape of the readiness response we care about
// (e.g. {"status":"ready",...}); extra fields like per-check detail are ignored.
export interface HealthStatus {
  status: string
}

// fetchHealth calls GET /readyz through the configured base URL and returns the
// parsed status. It throws on a non-2xx response or any network/parse error, so
// the caller can render success vs failure off resolve/reject. An optional
// AbortSignal lets the caller cancel an in-flight check (e.g. on unmount).
export async function fetchHealth(signal?: AbortSignal): Promise<HealthStatus> {
  const res = await fetch(apiUrl(healthPath), { signal })
  if (!res.ok) {
    throw new Error(`API returned HTTP ${res.status}`)
  }
  return (await res.json()) as HealthStatus
}

// healthUrl is the full URL the health probe hits — exported so the UI can show
// exactly which endpoint it called.
export const healthUrl = apiUrl(healthPath)

// --- Authenticated API access (M02.5) ---------------------------------------

// loginUrl starts the Google sign-in flow (Epic 01). Sign-in is a top-level
// browser navigation (the OAuth redirect dance), so the UI navigates the whole
// page here rather than fetching it.
export const loginUrl = apiUrl('/auth/login')

// UnauthorizedError marks a 401 from the API so callers can treat "not signed
// in" distinctly from network/other errors (the auth context maps it to the
// anonymous state; the central handler, S4, drives re-auth).
export class UnauthorizedError extends Error {
  constructor() {
    super('unauthorized')
    this.name = 'UnauthorizedError'
  }
}

// onUnauthorized is the single app-wide reaction to an expired/absent session.
let onUnauthorized: (() => void) | null = null

// setUnauthorizedHandler registers the one callback invoked whenever any
// authenticated API call returns 401 — i.e. the session expired or is missing.
// The auth provider registers a handler that flips the app to anonymous; the
// route gating (S3) then sends the user to sign-in, preserving their place via
// returnTo. Centralising it here means every call benefits without per-call 401
// checks. Pass null to clear (on unmount).
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn
}

// apiFetch is the single choke point for authenticated API calls. It always
// sends credentials so the httpOnly session cookie travels cross-origin to the
// API (and Set-Cookie is honoured), and it routes every 401 through the central
// unauthorized handler so an expired session triggers re-auth app-wide. The
// response is still returned so callers can handle it (e.g. fetchProfile throws
// UnauthorizedError); non-401 responses are untouched.
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(apiUrl(path), { ...init, credentials: 'include' })
  if (res.status === 401) {
    onUnauthorized?.()
  }
  return res
}

// Profile is the wire shape of GET /me (Epic 04). default_currency is read-only
// (always EUR in v1); the rest are editable via updateProfile (S5).
export interface Profile {
  id: string
  name: string
  email: string
  avatar: string
  home_base: string
  theme: string
  default_currency: string
  is_admin: boolean
}

// fetchProfile loads the signed-in user's profile (GET /me). It throws
// UnauthorizedError on 401 (no/expired session) and a generic Error otherwise.
export async function fetchProfile(signal?: AbortSignal): Promise<Profile> {
  const res = await apiFetch('/me', { signal })
  if (res.status === 401) {
    throw new UnauthorizedError()
  }
  if (!res.ok) {
    throw new Error(`API returned HTTP ${res.status}`)
  }
  return (await res.json()) as Profile
}

// ProfilePatch is the editable subset of the profile (PATCH /me). Omitted fields
// are left unchanged; default_currency is intentionally absent — it is read-only
// (always EUR) and the API ignores any attempt to change it.
export interface ProfilePatch {
  name?: string
  avatar?: string
  home_base?: string
  theme?: string
}

// ProfileValidationError carries the API's 400 message (e.g. an invalid theme or
// an over-long field) so the profile screen can show it to the user.
export class ProfileValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProfileValidationError'
  }
}

// updateProfile saves the editable profile fields (PATCH /me) and returns the
// updated profile. A 401 throws UnauthorizedError (the central handler drives
// re-auth); a 400 throws ProfileValidationError with the API's message.
export async function updateProfile(patch: ProfilePatch): Promise<Profile> {
  const res = await apiFetch('/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (res.status === 401) {
    throw new UnauthorizedError()
  }
  if (res.status === 400) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new ProfileValidationError(body?.error?.message ?? 'Invalid profile')
  }
  if (!res.ok) {
    throw new Error(`API returned HTTP ${res.status}`)
  }
  return (await res.json()) as Profile
}

// --- Trips (M03.5 S1) -------------------------------------------------------

// Trip is the wire shape of a single trip returned by GET /trips.
export interface Trip {
  id: string
  owner_id: string
  name: string
  destinations: string[]
  start_date: string
  end_date: string
  base_currency: string
  cover: string
  status: string
  created_at: string
  updated_at: string
  is_current: boolean
}

// TripsResponse is the bucketed shape of GET /trips — trips grouped by the
// server into Current / Upcoming / Past (archived trips are excluded).
export interface TripsResponse {
  current: Trip[]
  upcoming: Trip[]
  past: Trip[]
}

// fetchTrips loads the signed-in user's trips from GET /trips. It throws
// UnauthorizedError on 401 and a generic Error on other failures.
// Set VITE_USE_MOCK_TRIPS=true in .env.local to return local mock data instead.
export async function fetchTrips(signal?: AbortSignal): Promise<TripsResponse> {
  if (import.meta.env.VITE_USE_MOCK_TRIPS === 'true') {
    const { mockTripsResponse } = await import('./mock-trips')
    return mockTripsResponse
  }
  const res = await apiFetch('/trips', { signal })
  if (res.status === 401) {
    throw new UnauthorizedError()
  }
  if (!res.ok) {
    throw new Error(`API returned HTTP ${res.status}`)
  }
  return (await res.json()) as TripsResponse
}

// TripInput is the editable fields sent to POST /trips or PATCH /trips/:id.
export interface TripInput {
  name: string
  destinations: string[]
  start_date: string
  end_date: string
  cover: string
}

// TripValidationError carries the API's 400 message so the form can surface it.
export class TripValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TripValidationError'
  }
}

// TripShrinkConflictError is returned when a PATCH would remove days that hold
// data (409 days_have_data). count is how many days would be removed. Retry with
// forceShrink: true after user confirmation to proceed.
export class TripShrinkConflictError extends Error {
  count: number
  constructor(count: number) {
    super(`${count} day(s) hold data`)
    this.name = 'TripShrinkConflictError'
    this.count = count
  }
}

// createTrip calls POST /trips and returns the new trip. Throws TripValidationError
// on 400 and UnauthorizedError on 401.
export async function createTrip(input: TripInput): Promise<Trip> {
  const res = await apiFetch('/trips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (res.status === 401) throw new UnauthorizedError()
  if (res.status === 400) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new TripValidationError(body?.error?.message ?? 'Invalid trip')
  }
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`)
  return (await res.json()) as Trip
}

// updateTrip calls PATCH /trips/:id. Set forceShrink to true after user
// confirmation when TripShrinkConflictError is thrown.
export async function updateTrip(id: string, input: TripInput, forceShrink = false): Promise<Trip> {
  const res = await apiFetch(`/trips/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, force_shrink: forceShrink }),
  })
  if (res.status === 401) throw new UnauthorizedError()
  if (res.status === 400) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new TripValidationError(body?.error?.message ?? 'Invalid trip')
  }
  if (res.status === 409) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    const msg = body?.error?.message ?? ''
    const match = /^(\d+) day/.exec(msg)
    throw new TripShrinkConflictError(match ? parseInt(match[1], 10) : 1)
  }
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`)
  return (await res.json()) as Trip
}

// archiveTrip calls POST /trips/:id/archive. The trip stays in the database but
// is excluded from active buckets. Only the owner may archive (server enforced).
export async function archiveTrip(id: string): Promise<Trip> {
  const res = await apiFetch(`/trips/${id}/archive`, { method: 'POST' })
  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`)
  return (await res.json()) as Trip
}

// deleteTrip calls DELETE /trips/:id, which cascades to days and owned data.
// Only the owner may delete (server enforced).
export async function deleteTrip(id: string): Promise<void> {
  const res = await apiFetch(`/trips/${id}`, { method: 'DELETE' })
  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`)
}

// signOut ends the session server-side (clears the cookie, Epic 03). It resolves
// regardless of the response so the UI can always drop local auth state.
export async function signOut(): Promise<void> {
  try {
    await apiFetch('/auth/logout', { method: 'POST' })
  } catch {
    // Network failure on logout still clears client state — best effort.
  }
}

// --- Days (M03.5 S5, M04.5 S1) ----------------------------------------------

// Stay is the wire shape of a stay embedded in the day response.
export interface Stay {
  id: string
  trip_id: string
  name: string
  location?: string
  check_in?: string
  check_out?: string
  cost?: number
  link?: string
  // paid marks the stay as actually paid for; its cost only counts as spent in
  // the budget when paid, otherwise it's an upcoming estimate (M12.2). Optional
  // so cached day data written before the field existed still parses (treat
  // missing as false).
  paid?: boolean
}

// StayInput is the editable payload for creating or updating a stay. Only name
// is required. `id` (optional) is a client-generated UUID for upsert idempotency
// (offline replay). Dates are YYYY-MM-DD; send null to clear an optional field.
export interface StayInput {
  id?: string
  name: string
  location?: string | null
  check_in?: string | null
  check_out?: string | null
  cost?: number | null
  link?: string | null
  paid?: boolean
}

// StayValidationError carries the API's 400 message so the form can show it.
export class StayValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StayValidationError'
  }
}

// StayOverlapError is thrown on 409 — the stay shares a night with an existing
// stay (one accommodation per night, M12.1 S3). The UI messages this distinctly.
export class StayOverlapError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StayOverlapError'
  }
}

// createStay calls POST /trips/:id/stays and returns the new stay. Throws
// StayValidationError on 400, StayOverlapError on 409, UnauthorizedError on 401.
export async function createStay(tripId: string, input: StayInput): Promise<Stay> {
  const res = await apiFetch(`/trips/${tripId}/stays`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (res.status === 401) throw new UnauthorizedError()
  if (res.status === 409) throw new StayOverlapError('Another stay already covers those nights')
  if (res.status === 400) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new StayValidationError(body?.error?.message ?? 'Invalid stay')
  }
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`)
  return (await res.json()) as Stay
}

// updateStay calls PATCH /trips/:id/stays/:stayId and returns the updated stay.
// Throws StayValidationError on 400, StayOverlapError on 409, UnauthorizedError
// on 401.
export async function updateStay(tripId: string, stayId: string, input: StayInput): Promise<Stay> {
  const res = await apiFetch(`/trips/${tripId}/stays/${stayId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (res.status === 401) throw new UnauthorizedError()
  if (res.status === 409) throw new StayOverlapError('Another stay already covers those nights')
  if (res.status === 400) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new StayValidationError(body?.error?.message ?? 'Invalid stay')
  }
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`)
  return (await res.json()) as Stay
}

// deleteStay calls DELETE /trips/:id/stays/:stayId. Idempotent (204 even if the
// stay is already gone). Throws UnauthorizedError on 401.
export async function deleteStay(tripId: string, stayId: string): Promise<void> {
  const res = await apiFetch(`/trips/${tripId}/stays/${stayId}`, { method: 'DELETE' })
  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok && res.status !== 204) throw new Error(`API returned HTTP ${res.status}`)
}

// PlanItemKind is the behaviour of a plan item while planning — an activity, a
// leg of transport, a meal, or a plain note/reminder. It is independent of the
// item's budget category (the `type` field) and drives the item's icon, fields,
// and how it sorts on the timeline. 'activity' is the default. (M12.1)
export type PlanItemKind = 'activity' | 'transport' | 'food' | 'note'

// PlanItem is the wire shape of a plan item embedded in the day response.
export interface PlanItem {
  id: string
  trip_id: string
  day_id?: string
  title: string
  // kind is always sent by a current backend, but is optional here because the
  // instant-render cache (IndexedDB) can hold day payloads written before this
  // field shipped. Consumers normalise a missing kind to 'activity'. (M12.1)
  kind?: PlanItemKind
  type?: string
  start_time?: string
  duration?: string
  location?: string
  booking_status?: string
  cost?: number
  link?: string
  // Transport legs (kind === 'transport') carry a from→to and an arrival time;
  // departure is start_time. Optional; unused by other kinds. (M12.1 S2)
  origin?: string
  destination?: string
  arrive_time?: string
  // note is optional free-text context, surfaced on "what happened" items (a
  // thing you actually did, often logged after the fact). Independent of type
  // (budget category) and booking_status. Optional here for the same
  // instant-render cache reason as kind — payloads predating the column omit it.
  note?: string
  sort_order: number
  status: string
}

// Day is the wire shape of GET /trips/:id/days/:date.
export interface Day {
  id: string
  trip_id: string
  date: string
  index: number
  notes: string
  stays: Stay[]
  plan_items: PlanItem[]
}

// fetchDay loads a single day by trip ID and YYYY-MM-DD date. Throws
// UnauthorizedError on 401 and a generic Error on other failures.
export async function fetchDay(tripId: string, date: string, signal?: AbortSignal): Promise<Day> {
  const res = await apiFetch(`/trips/${tripId}/days/${date}`, { signal })
  if (res.status === 401) throw new UnauthorizedError()
  if (res.status === 404) throw new Error('day_not_found')
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`)
  return (await res.json()) as Day
}

// fetchBacklog loads the ideas backlog (plan items with no day assigned) for a
// trip. Throws UnauthorizedError on 401 and a generic Error on other failures.
export async function fetchBacklog(tripId: string, signal?: AbortSignal): Promise<PlanItem[]> {
  const res = await apiFetch(`/trips/${tripId}/plan-items/backlog`, { signal })
  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`)
  const body = (await res.json()) as { items: PlanItem[] }
  return body.items ?? []
}

// PlanItemInput is the editable payload for creating or updating a plan item.
// Only title is required; all other fields are optional. Omit day_id to create
// a backlog item (no day assigned).
export interface PlanItemInput {
  // id is an optional client-generated UUID used as the row id (upsert), so a
  // multi-step create (e.g. "log a done item" = create then set-status) can
  // reference the same item id online and offline. Omit it for a plain add.
  id?: string
  title: string
  day_id?: string | null
  kind?: PlanItemKind | null
  type?: string | null
  start_time?: string | null
  duration?: string | null
  location?: string | null
  booking_status?: string | null
  cost?: number | null
  link?: string | null
  origin?: string | null
  destination?: string | null
  arrive_time?: string | null
  note?: string | null
}

// PlanItemValidationError carries the API's 400 message so the form can show it.
export class PlanItemValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlanItemValidationError'
  }
}

// createPlanItem calls POST /trips/:id/plan-items and returns the new item.
// Throws PlanItemValidationError on 400 and UnauthorizedError on 401.
export async function createPlanItem(tripId: string, input: PlanItemInput): Promise<PlanItem> {
  const res = await apiFetch(`/trips/${tripId}/plan-items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (res.status === 401) throw new UnauthorizedError()
  if (res.status === 400) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new PlanItemValidationError(body?.error?.message ?? 'Invalid plan item')
  }
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`)
  return (await res.json()) as PlanItem
}

// updatePlanItem calls PATCH /trips/:id/plan-items/:itemId and returns the
// updated item. Throws PlanItemValidationError on 400 and UnauthorizedError on 401.
export async function updatePlanItem(
  tripId: string,
  itemId: string,
  input: PlanItemInput,
): Promise<PlanItem> {
  const res = await apiFetch(`/trips/${tripId}/plan-items/${itemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (res.status === 401) throw new UnauthorizedError()
  if (res.status === 400) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new PlanItemValidationError(body?.error?.message ?? 'Invalid plan item')
  }
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`)
  return (await res.json()) as PlanItem
}

// reorderPlanItems sends the new sort order for all plan items in a day.
// item_ids must include every item assigned to that day in the desired order.
export async function reorderPlanItems(
  tripId: string,
  dayId: string,
  itemIds: string[],
): Promise<void> {
  const res = await apiFetch(`/trips/${tripId}/plan-items/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ day_id: dayId, item_ids: itemIds }),
  })
  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`)
}

// movePlanItem moves a plan item to a different day in the same trip.
export async function movePlanItem(
  tripId: string,
  itemId: string,
  dayId: string,
  startTime?: string,
): Promise<PlanItem> {
  const body: Record<string, string> = { day_id: dayId }
  if (startTime) body.start_time = startTime
  const res = await apiFetch(`/trips/${tripId}/plan-items/${itemId}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`)
  return (await res.json()) as PlanItem
}

// promotePlanItem moves a backlog item to a specific day.
export async function promotePlanItem(
  tripId: string,
  itemId: string,
  dayId: string,
  startTime?: string,
): Promise<PlanItem> {
  const body: Record<string, string> = { day_id: dayId }
  if (startTime) body.start_time = startTime
  const res = await apiFetch(`/trips/${tripId}/plan-items/${itemId}/promote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`)
  return (await res.json()) as PlanItem
}

// deletePlanItem permanently removes a plan item (DELETE /trips/:id/plan-items/
// :itemId). Idempotent server-side (204 even if already gone), so a double
// click or a stale row is harmless.
export async function deletePlanItem(tripId: string, itemId: string): Promise<void> {
  const res = await apiFetch(`/trips/${tripId}/plan-items/${itemId}`, {
    method: 'DELETE',
  })
  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok && res.status !== 204) throw new Error(`API returned HTTP ${res.status}`)
}

// demotePlanItem moves a plan item back to the backlog (no day assigned).
export async function demotePlanItem(tripId: string, itemId: string): Promise<PlanItem> {
  const res = await apiFetch(`/trips/${tripId}/plan-items/${itemId}/demote`, {
    method: 'POST',
  })
  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`)
  return (await res.json()) as PlanItem
}

// setPlanItemStatus sets the status of a plan item to one of: planned, done,
// skipped, cancelled. Toggling the same status is idempotent (server-enforced).
export async function setPlanItemStatus(
  tripId: string,
  itemId: string,
  status: string,
): Promise<PlanItem> {
  const res = await apiFetch(`/trips/${tripId}/plan-items/${itemId}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`)
  return (await res.json()) as PlanItem
}

// --- Budget lines (M05.3 S1) -------------------------------------------------

export const BUDGET_CATEGORIES = ['Stays', 'Transport', 'Food', 'Activities', 'Other'] as const
export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number]

export interface BudgetLine {
  id: string
  trip_id: string
  day_id: string | null
  category: BudgetCategory
  planned_amount: number
  actual_amount: number
}

export interface SetBudgetLineInput {
  category: BudgetCategory
  planned_amount: number
}

// setTripBudgetLine upserts a trip-level budget line (no day scope).
export async function setTripBudgetLine(
  tripId: string,
  input: SetBudgetLineInput,
): Promise<BudgetLine> {
  const res = await apiFetch(`/trips/${tripId}/budget-lines`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error('Failed to set trip budget line')
  return (await res.json()) as BudgetLine
}

// setDayBudgetLine upserts a per-day budget line.
export async function setDayBudgetLine(
  tripId: string,
  dayId: string,
  input: SetBudgetLineInput,
): Promise<BudgetLine> {
  const res = await apiFetch(`/trips/${tripId}/days/${dayId}/budget-lines`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error('Failed to set day budget line')
  return (await res.json()) as BudgetLine
}

// --- Cost entries (M05.3 S2) -------------------------------------------------

export interface CostEntry {
  id: string
  trip_id: string
  day_id: string
  plan_item_id: string
  category: BudgetCategory
  amount: number
  note: string
  created_at: string
}

export interface CreateCostEntryInput {
  day_id?: string
  plan_item_id?: string
  category: BudgetCategory
  amount: number
  note?: string
}

export interface UpdateCostEntryInput {
  category: BudgetCategory
  amount: number
  note?: string
}

// listCostEntries calls GET /trips/:id/cost-entries and returns the trip's
// manually-logged expenses (ad-hoc costs, optionally pinned to a day).
export async function listCostEntries(tripId: string, signal?: AbortSignal): Promise<CostEntry[]> {
  const res = await apiFetch(`/trips/${tripId}/cost-entries`, { signal })
  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`)
  const body = (await res.json()) as { entries?: CostEntry[] }
  return body.entries ?? []
}

// createCostEntry calls POST /trips/:id/cost-entries.
export async function createCostEntry(
  tripId: string,
  input: CreateCostEntryInput,
): Promise<CostEntry> {
  const res = await apiFetch(`/trips/${tripId}/cost-entries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error('Failed to create cost entry')
  return (await res.json()) as CostEntry
}

// updateCostEntry calls PATCH /trips/:id/cost-entries/:entryId.
export async function updateCostEntry(
  tripId: string,
  entryId: string,
  input: UpdateCostEntryInput,
): Promise<CostEntry> {
  const res = await apiFetch(`/trips/${tripId}/cost-entries/${entryId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error('Failed to update cost entry')
  return (await res.json()) as CostEntry
}

// deleteCostEntry calls DELETE /trips/:id/cost-entries/:entryId.
export async function deleteCostEntry(tripId: string, entryId: string): Promise<void> {
  const res = await apiFetch(`/trips/${tripId}/cost-entries/${entryId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete cost entry')
}

// --- Roll-up (M05.3 display) -------------------------------------------------

export interface BudgetRollup {
  trip_total: number
  by_category: Record<string, number>
  by_day: Record<string, number>
  by_day_category: Record<string, Record<string, number>>
  // Estimated (upcoming) amounts: not-yet-happened costs — idea/planned items
  // and unpaid stays. Optional so a rollup cached before M12.2 still parses.
  estimated_trip_total?: number
  estimated_by_category?: Record<string, number>
  estimated_by_day?: Record<string, number>
  planned_trip_total: number
  planned_by_category: Record<string, number>
  planned_by_day: Record<string, number>
}

// fetchBudgetRollup calls GET /trips/:id/budget/rollup.
export async function fetchBudgetRollup(
  tripId: string,
  signal?: AbortSignal,
): Promise<BudgetRollup> {
  const res = await apiFetch(`/trips/${tripId}/budget/rollup`, { signal })
  if (!res.ok) throw new Error('Failed to fetch budget rollup')
  return (await res.json()) as BudgetRollup
}

// --- Journal entries (M06.4 S1) ------------------------------------------------

// JournalEntry is the wire shape of a single day's journal entry.
export interface JournalEntry {
  id: string
  day_id: string
  author_id: string
  body: string // plain text; stored server-side as {"text":"..."} JSONB
  rating: number | null
  weather: string
  mood: string
  created_at: string
  updated_at: string
}

// JournalEntryInput is the editable payload for upserting a day's entry.
export interface JournalEntryInput {
  body?: string
  rating?: number | null
  weather?: string
  mood?: string
}

// JournalEntryNotFoundError is returned by fetchJournalEntry when the day has
// no entry yet (404 entry_not_found).
export class JournalEntryNotFoundError extends Error {
  constructor() {
    super('journal entry not found')
    this.name = 'JournalEntryNotFoundError'
  }
}

// RawJournalEntry is the shape the server sends; body is a JSONB envelope.
type RawJournalEntry = {
  id: string
  day_id: string
  author_id: string
  body: { text?: string } | string
  rating?: number | null
  weather?: string
  mood?: string
  created_at: string
  updated_at: string
}

// parseJournalEntry normalises the server's raw response into the client-facing
// JournalEntry shape. Centralised here so fetchJournalEntry and
// upsertJournalEntry don't duplicate the body-envelope logic.
function parseJournalEntry(raw: RawJournalEntry): JournalEntry {
  return {
    id: raw.id,
    day_id: raw.day_id,
    author_id: raw.author_id,
    body: typeof raw.body === 'string' ? raw.body : (raw.body?.text ?? ''),
    rating: raw.rating ?? null,
    weather: raw.weather ?? '',
    mood: raw.mood ?? '',
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  }
}

// fetchJournalEntry loads the journal entry for a day. Throws
// JournalEntryNotFoundError when none exists yet (404), UnauthorizedError on
// 401, and a generic Error otherwise.
export async function fetchJournalEntry(
  tripId: string,
  dayId: string,
  signal?: AbortSignal,
): Promise<JournalEntry> {
  const res = await apiFetch(`/trips/${tripId}/days/${dayId}/journal`, { signal })
  if (res.status === 401) throw new UnauthorizedError()
  if (res.status === 404) throw new JournalEntryNotFoundError()
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`)
  return parseJournalEntry((await res.json()) as RawJournalEntry)
}

// upsertJournalEntry idempotently creates or updates the day's journal entry.
// Returns the saved entry. Throws UnauthorizedError on 401.
export async function upsertJournalEntry(
  tripId: string,
  dayId: string,
  input: JournalEntryInput,
): Promise<JournalEntry> {
  const body = {
    body: { text: input.body ?? '' },
    rating: input.rating ?? null,
    weather: input.weather ?? '',
    mood: input.mood ?? '',
  }
  const res = await apiFetch(`/trips/${tripId}/days/${dayId}/journal`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`)
  return parseJournalEntry((await res.json()) as RawJournalEntry)
}

// --- Photos (M06.4 S2) ---------------------------------------------------------

// Photo is the wire shape of a single attached photo.
export interface Photo {
  id: string
  journal_entry_id: string
  storage_url: string
  thumbnail_url: string
  caption: string
  size_bytes: number
  created_at: string
}

// PhotoCapExceededError is thrown when the server rejects an upload because the
// trip's 1 GB photo quota has been reached (413 quota_exceeded).
export class PhotoCapExceededError extends Error {
  serverMessage: string
  constructor(serverMessage: string) {
    super(serverMessage)
    this.name = 'PhotoCapExceededError'
    this.serverMessage = serverMessage
  }
}

// listPhotos loads all photos attached to a day's journal entry (GET …/photos).
// Returns an empty array when the day has no entry yet (404 entry_not_found).
export async function listPhotos(
  tripId: string,
  dayId: string,
  signal?: AbortSignal,
): Promise<Photo[]> {
  const res = await apiFetch(`/trips/${tripId}/days/${dayId}/journal/photos`, { signal })
  if (res.status === 401) throw new UnauthorizedError()
  if (res.status === 404) return [] // no entry yet — no photos
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`)
  return (await res.json()) as Photo[]
}

// uploadPhoto posts a photo file (multipart/form-data) and returns the new Photo.
// Throws PhotoCapExceededError when the trip's 1 GB quota is exceeded (413).
export async function uploadPhoto(
  tripId: string,
  dayId: string,
  file: File,
  caption?: string,
): Promise<Photo> {
  const form = new FormData()
  form.append('photo', file)
  if (caption) form.append('caption', caption)
  const res = await apiFetch(`/trips/${tripId}/days/${dayId}/journal/photos`, {
    method: 'POST',
    body: form,
  })
  if (res.status === 401) throw new UnauthorizedError()
  if (res.status === 413 || res.status === 422) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    const msg = body?.error?.message ?? 'Upload failed'
    if (res.status === 413) throw new PhotoCapExceededError(msg)
    throw new Error(msg)
  }
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`)
  return (await res.json()) as Photo
}

// deletePhoto removes a photo from the day's entry (DELETE …/photos/:photoId).
export async function deletePhoto(tripId: string, dayId: string, photoId: string): Promise<void> {
  const res = await apiFetch(`/trips/${tripId}/days/${dayId}/journal/photos/${photoId}`, {
    method: 'DELETE',
  })
  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`)
}

// --- Trip photo usage (M06.4 S3) -----------------------------------------------

// TripUsage is the wire shape of GET /trips/:id/usage.
export interface TripUsage {
  used_bytes: number
  cap_bytes: number
  near_cap: boolean
  used_pct: number
}

// fetchTripUsage loads the per-trip photo storage usage from GET /trips/:id/usage.
// Throws UnauthorizedError on 401 and a generic Error otherwise.
export async function fetchTripUsage(tripId: string, signal?: AbortSignal): Promise<TripUsage> {
  const res = await apiFetch(`/trips/${tripId}/usage`, { signal })
  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`)
  return (await res.json()) as TripUsage
}

// --- Sharing (M08.4) --------------------------------------------------------

// TripRole is the role a member holds on a trip.
export type TripRole = 'owner' | 'editor' | 'viewer'

// TripMember is a single membership returned by GET /trips/:id/memberships.
export interface TripMember {
  id: string
  trip_id: string
  user_id: string
  role: TripRole
}

// TripInvitation is a single invitation returned by GET /trips/:id/invitations.
export interface TripInvitation {
  id: string
  trip_id: string
  email: string
  role: TripRole
  status: 'sent' | 'accepted' | 'revoked'
}

// SharingData bundles the members and invitations for the sharing surface.
export interface SharingData {
  members: TripMember[]
  invitations: TripInvitation[]
}

// fetchSharingData loads the members and invitations for a trip. Throws
// UnauthorizedError on 401; non-owners get an empty invitations array (403).
export async function fetchSharingData(tripId: string, signal?: AbortSignal): Promise<SharingData> {
  const [membersRes, invitationsRes] = await Promise.all([
    apiFetch(`/trips/${tripId}/memberships`, { signal }),
    apiFetch(`/trips/${tripId}/invitations`, { signal }),
  ])
  if (membersRes.status === 401) throw new UnauthorizedError()
  if (!membersRes.ok) throw new Error(`API returned HTTP ${membersRes.status}`)

  const membersBody = (await membersRes.json()) as { members: TripMember[] }

  if (invitationsRes.status === 401) throw new UnauthorizedError()
  // Non-owners get 403 on invitations — return empty list gracefully.
  let invitations: TripInvitation[] = []
  if (invitationsRes.ok) {
    const invBody = (await invitationsRes.json()) as { invitations: TripInvitation[] }
    invitations = invBody.invitations ?? []
  }

  return {
    members: membersBody.members ?? [],
    invitations,
  }
}

// PendingInvitation is a still-pending invitation waiting for the signed-in
// user, returned by GET /invitations (the in-app inbox).
export interface PendingInvitation {
  id: string
  trip_id: string
  trip_name: string
  role: TripRole
}

// fetchMyInvitations loads the invitations addressed to the signed-in user's
// email that they haven't accepted yet (GET /invitations). This is how an
// invited person discovers a shared trip in-app without relying on the email.
export async function fetchMyInvitations(signal?: AbortSignal): Promise<PendingInvitation[]> {
  const res = await apiFetch('/invitations', { signal })
  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`)
  const body = (await res.json()) as { invitations: PendingInvitation[] }
  return body.invitations ?? []
}

// acceptInvitation accepts one of the caller's pending invitations by id
// (POST /invitations/:id/accept), joining the trip. Throws UnauthorizedError on
// 401 and a message-bearing Error on other failures.
export async function acceptInvitation(invitationId: string): Promise<void> {
  const res = await apiFetch(`/invitations/${invitationId}/accept`, { method: 'POST' })
  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new Error(body?.error?.message ?? `API returned HTTP ${res.status}`)
  }
}

// sendInvitation calls POST /trips/:id/invitations. Throws UnauthorizedError on
// 401 and a generic Error on other failures.
export async function sendInvitation(
  tripId: string,
  email: string,
  role: 'editor' | 'viewer',
): Promise<TripInvitation> {
  const res = await apiFetch(`/trips/${tripId}/invitations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, role }),
  })
  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new Error(body?.error?.message ?? `API returned HTTP ${res.status}`)
  }
  return (await res.json()) as TripInvitation
}

// revokeInvitation calls DELETE /trips/:id/invitations/:invitationId.
export async function revokeInvitation(tripId: string, invitationId: string): Promise<void> {
  const res = await apiFetch(`/trips/${tripId}/invitations/${invitationId}`, { method: 'DELETE' })
  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`)
}

// changeMemberRole calls PATCH /trips/:id/memberships/:userId.
export async function changeMemberRole(
  tripId: string,
  userId: string,
  role: 'editor' | 'viewer',
): Promise<void> {
  const res = await apiFetch(`/trips/${tripId}/memberships/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  })
  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`)
}

// revokeMember calls DELETE /trips/:id/memberships/:userId.
export async function revokeMember(tripId: string, userId: string): Promise<void> {
  const res = await apiFetch(`/trips/${tripId}/memberships/${userId}`, { method: 'DELETE' })
  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`)
}

// datesInRange returns YYYY-MM-DD strings for every calendar date in [start, end],
// derived client-side from the trip's start_date and end_date strings. Matches the
// server's day generation so the shell can navigate without an extra API call.
// Dates are parsed as UTC noon to avoid DST/timezone boundary drift.
export function datesInRange(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  // Parse as UTC noon so toISOString().slice(0,10) always returns the input date
  // regardless of the client's local timezone offset.
  const toMs = (s: string) => new Date(s + 'T12:00:00Z').getTime()
  const endMs = toMs(endDate)
  for (let ms = toMs(startDate); ms <= endMs; ms += 86_400_000) {
    dates.push(new Date(ms).toISOString().slice(0, 10))
  }
  return dates
}

// --- Geo proxy (M07.3) -------------------------------------------------------

// LatLng is a geographic coordinate pair returned by the geo proxy.
export interface LatLng {
  lat: number
  lng: number
}

// DayRouteResponse is the wire shape of POST /geo/day-route.
export interface DayRouteResponse {
  waypoints: LatLng[]
}

// fetchDayRoute posts an ordered list of location strings to the geo proxy and
// returns geocoded waypoints (locations without a resolvable address are
// silently excluded by the server). Throws UnauthorizedError on 401.
export async function fetchDayRoute(
  locations: string[],
  signal?: AbortSignal,
): Promise<DayRouteResponse> {
  const res = await apiFetch('/geo/day-route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locations }),
    signal,
  })
  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok) throw new Error(`day-route failed: HTTP ${res.status}`)
  return (await res.json()) as DayRouteResponse
}

// geocodeLocation resolves a single free-text location to coordinates via the
// geo proxy (GET /geo/geocode). Returns the LatLng when the address resolves,
// or null when the location cannot be found (HTTP 404) — this is the "not a real
// place" signal the location field uses for live feedback. Throws
// UnauthorizedError on 401 and a generic Error on other failures so callers can
// distinguish "not found" (expected) from "couldn't check" (transient).
export async function geocodeLocation(
  location: string,
  signal?: AbortSignal,
): Promise<LatLng | null> {
  const res = await apiFetch(`/geo/geocode?location=${encodeURIComponent(location)}`, { signal })
  if (res.status === 401) throw new UnauthorizedError()
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`geocode failed: HTTP ${res.status}`)
  return (await res.json()) as LatLng
}

// Suggestion is a single place-autocomplete prediction from GET /geo/autocomplete.
// description is the human-readable label shown in the dropdown; place_id is
// Google's stable identifier (kept for future use — details lookups etc.).
export interface Suggestion {
  description: string
  place_id: string
}

// fetchAutocomplete returns place predictions for a partial location string,
// powering the plan form's location suggestions. Returns an empty array when
// there are no matches. Throws UnauthorizedError on 401.
export async function fetchAutocomplete(
  input: string,
  signal?: AbortSignal,
): Promise<Suggestion[]> {
  const res = await apiFetch(`/geo/autocomplete?input=${encodeURIComponent(input)}`, { signal })
  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok) throw new Error(`autocomplete failed: HTTP ${res.status}`)
  const data = (await res.json()) as { suggestions?: Suggestion[] }
  return data.suggestions ?? []
}

// MARKER_COLOR is the accent colour used for itinerary pins (PRD §5.10 restrained
// accent). Must be a Google Static Maps colour literal (name or 0xRRGGBB).
const MARKER_COLOR = '0x4F7942'

// ROUTE_COLOR / PATH_WEIGHT style the indicative route polyline — softer than
// the pins for visual hierarchy. The alpha suffix (80) adds transparency.
const ROUTE_COLOR = '0x4F794280'
const PATH_WEIGHT = 3

// staticMapUrl builds the URL for the GET /geo/static-map endpoint. The server
// proxies the request to Google Static Maps and embeds the API key — no key is
// ever sent to the client. Returns null when there are no waypoints to display.
export function staticMapUrl(
  waypoints: LatLng[],
  opts?: { size?: string; scale?: 1 | 2 },
): string | null {
  if (waypoints.length === 0) return null
  const params = new URLSearchParams()
  if (opts?.size) params.set('size', opts.size)
  if (opts?.scale === 2) params.set('scale', '2')
  for (const wp of waypoints) {
    // Prefix with size and color style so all pins share the accent colour.
    params.append('markers', `size:mid|color:${MARKER_COLOR}|${wp.lat},${wp.lng}`)
  }
  if (waypoints.length > 1) {
    // The first path entry carries the style prefix; subsequent entries are
    // plain coordinates. All connected items produce the indicative route.
    const [first, ...rest] = waypoints
    params.append('path', `weight:${PATH_WEIGHT}|color:${ROUTE_COLOR}|${first.lat},${first.lng}`)
    for (const wp of rest) {
      params.append('path', `${wp.lat},${wp.lng}`)
    }
  }
  return apiUrl(`/geo/static-map?${params.toString()}`)
}

// --- Admin backoffice (M08.5) -----------------------------------------------

// AdminUser is the wire shape of a user row in the admin list.
export interface AdminUser {
  id: string
  email: string
  name: string
  is_admin: boolean
  active: boolean
}

// AdminTrip is the wire shape of a trip row in the admin list.
export interface AdminTrip {
  id: string
  name: string
  owner_id: string
  owner_email: string
  start_date: string
  end_date: string
  status: string
}

// fetchAdminUsers lists all users from the admin backoffice endpoint.
export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const res = await apiFetch('/admin/users')
  if (res.status === 403) throw new Error('forbidden')
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`)
  return (await res.json()) as AdminUser[]
}

// fetchAdminTrips lists all trips from the admin backoffice endpoint.
export async function fetchAdminTrips(): Promise<AdminTrip[]> {
  const res = await apiFetch('/admin/trips')
  if (res.status === 403) throw new Error('forbidden')
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`)
  return (await res.json()) as AdminTrip[]
}

// deactivateUser deactivates a user via the admin endpoint.
export async function deactivateUser(userID: string): Promise<void> {
  const res = await apiFetch(`/admin/users/${userID}/deactivate`, { method: 'POST' })
  if (res.status === 403) throw new Error('forbidden')
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`)
}

// adminGrantAccess grants a user access to a trip via the admin endpoint.
export async function adminGrantAccess(
  tripID: string,
  userID: string,
  role: string,
): Promise<void> {
  const res = await apiFetch(`/admin/trips/${tripID}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userID, role }),
  })
  if (res.status === 403) throw new Error('forbidden')
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`)
}

// adminRevokeAccess revokes a user's access to a trip via the admin endpoint.
export async function adminRevokeAccess(tripID: string, userID: string): Promise<void> {
  const res = await apiFetch(`/admin/trips/${tripID}/members/${userID}`, { method: 'DELETE' })
  if (res.status === 403) throw new Error('forbidden')
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`)
}

// adminChangeRole changes a member's role via the admin endpoint.
export async function adminChangeRole(tripID: string, userID: string, role: string): Promise<void> {
  const res = await apiFetch(`/admin/trips/${tripID}/members/${userID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  })
  if (res.status === 403) throw new Error('forbidden')
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`)
}

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
  name: string
  email: string
  avatar: string
  home_base: string
  theme: string
  default_currency: string
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
}

// PlanItem is the wire shape of a plan item embedded in the day response.
export interface PlanItem {
  id: string
  trip_id: string
  day_id?: string
  title: string
  type?: string
  start_time?: string
  duration?: string
  location?: string
  booking_status?: string
  cost?: number
  link?: string
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
  title: string
  day_id?: string | null
  type?: string | null
  start_time?: string | null
  duration?: string | null
  location?: string | null
  booking_status?: string | null
  cost?: number | null
  link?: string | null
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
  const raw = (await res.json()) as {
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
  const raw = (await res.json()) as {
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

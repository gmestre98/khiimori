// Offline behaviour integration tests (M09.4 S5).
//
// Covers the four scenarios from the epic ACs without hitting a real network:
//   1. Install — manifest + icons + PWA tags present (already in manifest.test.ts;
//      the shell/SW guard below complements it).
//   2. Offline shell load — caching strategy fields verified statically.
//   3. Offline current-trip view — isCacheableRead logic extracted and tested.
//   4. Queued write replay on reconnect — enqueue writes offline, simulate the
//      'online' event, verify replayQueue drains them in order.
//
// Everything runs under Vitest/jsdom with no real network. Offline/online
// transitions are simulated by stubbing navigator.onLine and firing window
// events.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { enqueue, getAll, _resetForTesting as resetQueue } from '../lib/mutationQueue'
import { replayQueue, startReplayOnReconnect, stopReplayOnReconnect } from '../lib/replayQueue'

// ── 1. Shell & installability guard ──────────────────────────────────────────
// (Complements manifest.test.ts; verifies the sw.js caching contract is
//  described and the version constant is present so a CACHE_VERSION bump is
//  diagnosable in CI.)

import { readFileSync } from 'node:fs'

describe('offline shell — sw.js contract', () => {
  const sw = readFileSync(`${process.cwd()}/public/sw.js`, 'utf8')

  it('declares a CACHE_VERSION constant (bump to invalidate caches)', () => {
    expect(sw).toMatch(/const CACHE_VERSION\s*=\s*['"]v\d+['"]/)
  })

  it('precaches the shell HTML document for offline boot', () => {
    expect(sw).toContain("'/index.html'")
    expect(sw).toContain("'/manifest.webmanifest'")
  })

  it('clears old caches on activate (no stale-forever risk)', () => {
    // The activate handler calls caches.keys() (may span newline) and filters
    // khiimori-* keys, keeping the current version.
    expect(sw).toMatch(/caches\s*\.\s*keys\s*\(/)
    expect(sw).toContain('khiimori-')
    expect(sw).toContain('keep.has(key)')
  })

  it('handles SKIP_WAITING for the update activation policy (S5)', () => {
    expect(sw).toContain("'SKIP_WAITING'")
    expect(sw).toContain('skipWaiting()')
  })

  it('broadcasts SW_ACTIVATED so clients can reload on update (S5)', () => {
    expect(sw).toContain("'SW_ACTIVATED'")
  })
})

// ── 2. Offline current-trip view — isCacheableRead logic ─────────────────────
// Extract the predicate's logic to verify it in-process (the actual SW runs in
// a worker context not available under jsdom).

function isCacheableRead(method: string, pathname: string, activeTripId: string | null): boolean {
  if (method !== 'GET') return false
  if (pathname.endsWith('/trips')) return true
  return activeTripId !== null && pathname.includes(`/trips/${activeTripId}/`)
}

describe('offline current-trip view — isCacheableRead', () => {
  it('caches the trips listing regardless of active trip', () => {
    expect(isCacheableRead('GET', '/api/trips', null)).toBe(true)
  })

  it('caches reads for the active trip', () => {
    expect(isCacheableRead('GET', '/api/trips/abc-123/days/2025-06-01', 'abc-123')).toBe(true)
    expect(isCacheableRead('GET', '/api/trips/abc-123/plan-items/backlog', 'abc-123')).toBe(true)
  })

  it('does not cache reads for a different trip', () => {
    expect(isCacheableRead('GET', '/api/trips/other-trip/days/2025-06-01', 'abc-123')).toBe(false)
  })

  it('does not cache when no active trip is set', () => {
    expect(isCacheableRead('GET', '/api/trips/abc-123/days/2025-06-01', null)).toBe(false)
  })

  it('does not intercept non-GET requests (writes go to the queue)', () => {
    expect(isCacheableRead('POST', '/api/trips/abc-123/plan-items', 'abc-123')).toBe(false)
  })

  it('does not match a trip whose id is a prefix of the active one', () => {
    // activeTripId='ab' must not match '/trips/abc-123/…'
    expect(isCacheableRead('GET', '/api/trips/abc-123/days/2025-06-01', 'ab')).toBe(false)
  })
})

// ── 3 + 4. Queued write replay on reconnect ───────────────────────────────────
// Full offline → enqueue → online → drain cycle, using fake-indexeddb and
// mocked API calls so no real network is involved.

// Inject fake IndexedDB so mutationQueue can open a real IDB handle in jsdom.
vi.stubGlobal('indexedDB', new IDBFactory())

// Mock the API layer so dispatch() calls don't hit the network.
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return {
    ...actual,
    createPlanItem: vi.fn().mockResolvedValue({}),
    upsertJournalEntry: vi.fn().mockResolvedValue({}),
  }
})

import * as api from '../lib/api'

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value })
}

beforeEach(async () => {
  await resetQueue()
  vi.clearAllMocks()
})

afterEach(async () => {
  stopReplayOnReconnect()
  setOnline(true)
  await resetQueue()
})

describe('queued write replay on reconnect', () => {
  it('enqueues writes while offline and drains them on reconnect', async () => {
    // Go offline.
    setOnline(false)

    // Queue a Planning write (M04) and a Journal write (M06) — the same queue.
    await enqueue('createPlanItem', { tripId: 't1', input: { title: 'Hike' } })
    await enqueue('upsertJournalEntry', { tripId: 't1', dayId: 'd1', input: { text: 'day 1' } })

    const pending = await getAll()
    expect(pending).toHaveLength(2)
    expect(pending.map((m) => m.kind)).toEqual(['createPlanItem', 'upsertJournalEntry'])

    // Come online and let the reconnect listener run.
    const onReplay = vi.fn()
    startReplayOnReconnect(onReplay)
    setOnline(true)
    window.dispatchEvent(new Event('online'))

    // Wait for the async replay to settle.
    await vi.waitFor(() => expect(onReplay).toHaveBeenCalled())

    // Both API calls dispatched.
    expect(api.createPlanItem).toHaveBeenCalledTimes(1)
    expect(api.upsertJournalEntry).toHaveBeenCalledTimes(1)

    // Queue drained.
    const remaining = await getAll()
    expect(remaining).toHaveLength(0)
  })

  it('replays in seq order (first-in, first-out)', async () => {
    setOnline(false)
    const order: string[] = []
    vi.mocked(api.createPlanItem).mockImplementation(async () => {
      order.push('createPlanItem')
      return {} as never
    })
    vi.mocked(api.upsertJournalEntry).mockImplementation(async () => {
      order.push('upsertJournalEntry')
      return {} as never
    })

    await enqueue('createPlanItem', { tripId: 't1', input: { title: 'First' } })
    await enqueue('upsertJournalEntry', { tripId: 't1', dayId: 'd1', input: { text: 'Second' } })

    const results = await replayQueue()
    expect(results.map((r) => r.kind)).toEqual(['createPlanItem', 'upsertJournalEntry'])
    expect(order).toEqual(['createPlanItem', 'upsertJournalEntry'])
  })

  it('leaves transient failures in the queue for the next reconnect', async () => {
    setOnline(false)
    vi.mocked(api.createPlanItem).mockRejectedValue(new TypeError('fetch failed'))

    await enqueue('createPlanItem', { tripId: 't1', input: { title: 'Retry me' } })

    await expect(replayQueue()).rejects.toThrow('1 mutation(s) failed to replay')
    // Item remains so the next reconnect retries.
    expect(await getAll()).toHaveLength(1)
  })

  it('removes permanent failures so the queue does not get stuck', async () => {
    setOnline(false)
    vi.mocked(api.createPlanItem).mockRejectedValue(new api.PlanItemValidationError('bad title'))

    await enqueue('createPlanItem', { tripId: 't1', input: { title: '' } })

    const results = await replayQueue()
    expect(results[0].outcome).toBe('permanent_failure')
    // Permanent failure removed — queue clear.
    expect(await getAll()).toHaveLength(0)
  })
})

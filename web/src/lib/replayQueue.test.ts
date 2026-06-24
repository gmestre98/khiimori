// Tests for the offline replay engine (M04.6 S2).
// fake-indexeddb provides an in-process IDB so the queue module works in Node.
// API functions are vi.spyOn'd — no real HTTP calls are made.

import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as api from './api'
import { enqueue, clearQueue, _resetForTesting } from './mutationQueue'
import {
  replayQueue,
  startReplayOnReconnect,
  stopReplayOnReconnect,
  ReplayError,
  type ReplayResult,
} from './replayQueue'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tripId = 'trip-1'
const itemId = 'item-1'
const dayId = 'day-1'

// Minimal PlanItem stub that satisfies the API return type.
const stubItem: api.PlanItem = {
  id: itemId,
  trip_id: tripId,
  title: 'stub',
  sort_order: 0,
  status: 'planned',
}

// Each call to the returned mock produces a fresh Response so the body is never
// read twice (Response.body is a one-shot ReadableStream).
function makeOkFetch(body: unknown = stubItem): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  )
}

function make4xxFetch(status: number): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({ error: { message: 'bad' } }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  )
}

function make5xxFetch(): ReturnType<typeof vi.fn> {
  return vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(new Response('Internal Server Error', { status: 500 })),
    )
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

// We mock globalThis.fetch because the api functions call the module-local
// `apiFetch`, which in turn calls `fetch`. Spying on the exported `apiFetch`
// binding does not intercept same-module calls.
let originalFetch: typeof globalThis.fetch

beforeEach(() => {
  originalFetch = globalThis.fetch
})

afterEach(async () => {
  globalThis.fetch = originalFetch
  stopReplayOnReconnect()
  await clearQueue().catch(() => {})
  await _resetForTesting()
})

// ---------------------------------------------------------------------------
// replayQueue — empty queue
// ---------------------------------------------------------------------------

describe('replayQueue — empty queue', () => {
  it('returns an empty array when the queue is empty', async () => {
    const results = await replayQueue()
    expect(results).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// replayQueue — ordered replay
// ---------------------------------------------------------------------------

describe('replayQueue — ordered replay', () => {
  it('replays mutations in seq order and removes them on success', async () => {
    const callOrder: string[] = []

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      callOrder.push(url as string)
      return Promise.resolve(
        new Response(JSON.stringify(stubItem), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    })

    await enqueue('createPlanItem', { tripId, input: { title: 'A' } })
    await enqueue('updatePlanItem', { tripId, itemId, input: { title: 'B' } })
    await enqueue('setPlanItemStatus', { tripId, itemId, status: 'done' })

    const results = await replayQueue()

    expect(results).toHaveLength(3)
    expect(results.every((r) => r.outcome === 'success')).toBe(true)

    // Must have been called in enqueue order (seq 1 → 2 → 3).
    expect(callOrder[0]).toContain('plan-items')
    expect(callOrder[1]).toContain(`plan-items/${itemId}`)
    expect(callOrder[2]).toContain('status')
  })

  it('queue is empty after a fully-successful replay', async () => {
    globalThis.fetch = makeOkFetch() as typeof globalThis.fetch

    await enqueue('createPlanItem', { tripId, input: { title: 'A' } })
    await replayQueue()

    // Second replay finds nothing.
    const second = await replayQueue()
    expect(second).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// replayQueue — idempotency (re-sending doesn't duplicate)
// ---------------------------------------------------------------------------

describe('replayQueue — idempotent replay', () => {
  it('can replay the same payload twice and succeeds both times (server is idempotent)', async () => {
    const mockFetch = makeOkFetch()
    globalThis.fetch = mockFetch

    await enqueue('updatePlanItem', { tripId, itemId, input: { title: 'Hi' } })

    // First replay drains the queue.
    const first = await replayQueue()
    expect(first[0].outcome).toBe('success')

    // Re-enqueue the same payload (simulates what would happen if the queue
    // weren't drained — the server must handle it without corruption).
    await enqueue('updatePlanItem', { tripId, itemId, input: { title: 'Hi' } })
    const second = await replayQueue()
    expect(second[0].outcome).toBe('success')

    // Two calls total, both succeeded.
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})

// ---------------------------------------------------------------------------
// replayQueue — permanent failures (4xx)
// ---------------------------------------------------------------------------

describe('replayQueue — permanent failures', () => {
  it('removes a 400-rejected mutation and marks it permanent_failure', async () => {
    globalThis.fetch = make4xxFetch(400) as typeof globalThis.fetch

    await enqueue('createPlanItem', { tripId, input: { title: 'X' } })
    const results = await replayQueue()

    expect(results[0].outcome).toBe('permanent_failure')

    // Queue should now be empty (permanent failure is removed).
    const remaining = await replayQueue()
    expect(remaining).toEqual([])
  })

  it('removes a 401-rejected mutation and marks it permanent_failure', async () => {
    globalThis.fetch = make4xxFetch(401) as typeof globalThis.fetch

    await enqueue('updatePlanItem', { tripId, itemId, input: { title: 'Y' } })
    const results = await replayQueue()

    expect(results[0].outcome).toBe('permanent_failure')
  })

  it('does not throw ReplayError when all failures are permanent', async () => {
    globalThis.fetch = make4xxFetch(400) as typeof globalThis.fetch

    await enqueue('createPlanItem', { tripId, input: { title: 'Z' } })
    await expect(replayQueue()).resolves.not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// replayQueue — transient failures (5xx / network)
// ---------------------------------------------------------------------------

describe('replayQueue — transient failures', () => {
  it('leaves a 5xx-failed mutation in the queue and marks it transient_failure', async () => {
    globalThis.fetch = make5xxFetch() as typeof globalThis.fetch

    await enqueue('setPlanItemStatus', { tripId, itemId, status: 'done' })

    await expect(replayQueue()).rejects.toBeInstanceOf(ReplayError)

    // The mutation must still be in the queue for the next reconnect.
    let remaining: ReplayResult[] = []
    await replayQueue().catch((e: unknown) => {
      if (e instanceof ReplayError) remaining = e.results
    })
    expect(remaining[0].outcome).toBe('transient_failure')
  })

  it('throws ReplayError whose results include the transient entry', async () => {
    globalThis.fetch = make5xxFetch() as typeof globalThis.fetch

    await enqueue('reorderPlanItems', { tripId, dayId, itemIds: ['a', 'b'] })

    let caught: unknown
    await replayQueue().catch((e) => {
      caught = e
    })

    expect(caught).toBeInstanceOf(ReplayError)
    const err = caught as ReplayError
    expect(err.results).toHaveLength(1)
    expect(err.results[0].outcome).toBe('transient_failure')
  })

  it('continues replaying later mutations after a transient failure', async () => {
    // First call fails transiently; second succeeds.
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('err', { status: 500 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(stubItem), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

    await enqueue('createPlanItem', { tripId, input: { title: 'fail' } })
    await enqueue('updatePlanItem', { tripId, itemId, input: { title: 'ok' } })

    let caught: unknown
    await replayQueue().catch((e) => {
      caught = e
    })

    expect(caught).toBeInstanceOf(ReplayError)
    const err = caught as ReplayError
    expect(err.results).toHaveLength(2)
    expect(err.results[0].outcome).toBe('transient_failure')
    expect(err.results[1].outcome).toBe('success')
  })
})

// ---------------------------------------------------------------------------
// replayQueue — all mutation kinds dispatch correctly
// ---------------------------------------------------------------------------

describe('replayQueue — all mutation kinds', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = makeOkFetch()
    globalThis.fetch = mockFetch as typeof globalThis.fetch
  })

  it('dispatches createPlanItem', async () => {
    await enqueue('createPlanItem', { tripId, input: { title: 'New' } })
    const [r] = await replayQueue()
    expect(r.outcome).toBe('success')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('plan-items'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('dispatches updatePlanItem', async () => {
    await enqueue('updatePlanItem', { tripId, itemId, input: { title: 'Edit' } })
    const [r] = await replayQueue()
    expect(r.outcome).toBe('success')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(`plan-items/${itemId}`),
      expect.objectContaining({ method: 'PATCH' }),
    )
  })

  it('dispatches reorderPlanItems', async () => {
    await enqueue('reorderPlanItems', { tripId, dayId, itemIds: ['a', 'b'] })
    const [r] = await replayQueue()
    expect(r.outcome).toBe('success')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('reorder'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('dispatches movePlanItem', async () => {
    await enqueue('movePlanItem', { tripId, itemId, dayId })
    const [r] = await replayQueue()
    expect(r.outcome).toBe('success')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('move'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('dispatches promotePlanItem', async () => {
    await enqueue('promotePlanItem', { tripId, itemId, dayId })
    const [r] = await replayQueue()
    expect(r.outcome).toBe('success')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('promote'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('dispatches demotePlanItem', async () => {
    await enqueue('demotePlanItem', { tripId, itemId })
    const [r] = await replayQueue()
    expect(r.outcome).toBe('success')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('demote'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('dispatches setPlanItemStatus', async () => {
    await enqueue('setPlanItemStatus', { tripId, itemId, status: 'done' })
    const [r] = await replayQueue()
    expect(r.outcome).toBe('success')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('status'),
      expect.objectContaining({ method: 'POST' }),
    )
  })
})

// ---------------------------------------------------------------------------
// replayQueue — conflict resolution integration (M04.6 S3)
// ---------------------------------------------------------------------------

describe('replayQueue — conflict resolution', () => {
  it('collapses two reorders for the same day and dispatches only the last', async () => {
    const mockFetch = makeOkFetch()
    globalThis.fetch = mockFetch as typeof globalThis.fetch

    await enqueue('reorderPlanItems', { tripId, dayId, itemIds: ['a', 'b'] })
    await enqueue('reorderPlanItems', { tripId, dayId, itemIds: ['b', 'a'] })

    const results = await replayQueue()

    // Only one reorder dispatched (the last one wins).
    expect(results).toHaveLength(1)
    expect(results[0].outcome).toBe('success')
    expect(mockFetch).toHaveBeenCalledOnce()

    // Queue is now empty — both mutations were consumed.
    const second = await replayQueue()
    expect(second).toHaveLength(0)
  })

  it('superseded mutations are removed from the store even on replay success', async () => {
    globalThis.fetch = makeOkFetch() as typeof globalThis.fetch

    await enqueue('updatePlanItem', { tripId, itemId, input: { title: 'stale' } })
    await enqueue('updatePlanItem', { tripId, itemId, input: { title: 'final' } })

    const results = await replayQueue()

    expect(results).toHaveLength(1)
    expect(results[0].outcome).toBe('success')

    // A second replay should find nothing — the superseded mutation was also removed.
    const second = await replayQueue()
    expect(second).toHaveLength(0)
  })

  it('preserves creates alongside deduplicated updates', async () => {
    const mockFetch = makeOkFetch()
    globalThis.fetch = mockFetch as typeof globalThis.fetch

    await enqueue('createPlanItem', { tripId, input: { title: 'New item' } })
    await enqueue('updatePlanItem', { tripId, itemId, input: { title: 'v1' } })
    await enqueue('updatePlanItem', { tripId, itemId, input: { title: 'v2' } }) // supersedes prev

    const results = await replayQueue()

    // create + update(v2) = 2 dispatches
    expect(results).toHaveLength(2)
    expect(results.every((r) => r.outcome === 'success')).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})

// ---------------------------------------------------------------------------
// startReplayOnReconnect / stopReplayOnReconnect
// ---------------------------------------------------------------------------

describe('startReplayOnReconnect', () => {
  it('triggers replayQueue when the online event fires', async () => {
    globalThis.fetch = makeOkFetch() as typeof globalThis.fetch
    await enqueue('createPlanItem', { tripId, input: { title: 'queued' } })

    const onReplay = vi.fn()
    startReplayOnReconnect(onReplay)

    // Simulate the browser coming back online.
    window.dispatchEvent(new Event('online'))

    // replayQueue is async; yield to let all promises settle.
    await new Promise((r) => setTimeout(r, 50))

    expect(onReplay).toHaveBeenCalledOnce()
    const results: ReplayResult[] = onReplay.mock.calls[0][0]
    expect(results[0].outcome).toBe('success')
  })

  it('calls onError when replay encounters transient failures', async () => {
    globalThis.fetch = make5xxFetch() as typeof globalThis.fetch
    await enqueue('setPlanItemStatus', { tripId, itemId, status: 'done' })

    const onError = vi.fn()
    startReplayOnReconnect(undefined, onError)

    window.dispatchEvent(new Event('online'))
    await new Promise((r) => setTimeout(r, 50))

    expect(onError).toHaveBeenCalledOnce()
    expect(onError.mock.calls[0][0]).toBeInstanceOf(ReplayError)
  })

  it('does not register a second listener if called twice', async () => {
    globalThis.fetch = makeOkFetch() as typeof globalThis.fetch
    await enqueue('createPlanItem', { tripId, input: { title: 'once' } })

    const onReplay = vi.fn()
    startReplayOnReconnect(onReplay)
    startReplayOnReconnect(onReplay) // second call is a no-op

    window.dispatchEvent(new Event('online'))
    await new Promise((r) => setTimeout(r, 50))

    expect(onReplay).toHaveBeenCalledOnce()
  })

  it('stops firing after stopReplayOnReconnect()', async () => {
    globalThis.fetch = makeOkFetch() as typeof globalThis.fetch
    await enqueue('createPlanItem', { tripId, input: { title: 'stopped' } })

    const onReplay = vi.fn()
    startReplayOnReconnect(onReplay)
    stopReplayOnReconnect()

    window.dispatchEvent(new Event('online'))
    await new Promise((r) => setTimeout(r, 50))

    expect(onReplay).not.toHaveBeenCalled()
  })
})

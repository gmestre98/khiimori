// Tests for the client-side mutation queue (M04.6 S1).
// fake-indexeddb patches globalThis.indexedDB so the module runs in Node/jsdom
// without a real browser. Each test suite resets the DB via _resetForTesting()
// to start from a clean state.

import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import {
  enqueue,
  getAll,
  remove,
  clearQueue,
  _resetForTesting,
  type MutationKind,
  type QueuedMutation,
} from './mutationQueue'

afterEach(async () => {
  await clearQueue().catch(() => {})
  await _resetForTesting()
})

describe('enqueue', () => {
  it('returns a record with a stable UUID, seq=1, correct kind, and payload', async () => {
    const payload = { tripId: 't1', title: 'Lunch' }
    const m = await enqueue('createPlanItem', payload)

    expect(m.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(m.seq).toBe(1)
    expect(m.kind).toBe('createPlanItem')
    expect(m.payload).toEqual(payload)
    expect(m.enqueuedAt).toBeTruthy()
  })

  it('assigns monotonically increasing seq numbers', async () => {
    const a = await enqueue('createPlanItem', { tripId: 't1', title: 'A' })
    const b = await enqueue('updatePlanItem', { tripId: 't1', itemId: 'i1', title: 'B' })
    const c = await enqueue('setPlanItemStatus', { tripId: 't1', itemId: 'i1', status: 'done' })

    expect(a.seq).toBe(1)
    expect(b.seq).toBe(2)
    expect(c.seq).toBe(3)
  })

  it('assigns a unique id to each mutation', async () => {
    const a = await enqueue('createPlanItem', {})
    const b = await enqueue('createPlanItem', {})

    expect(a.id).not.toBe(b.id)
  })

  it('accepts every supported MutationKind', async () => {
    const kinds: MutationKind[] = [
      'createPlanItem',
      'updatePlanItem',
      'reorderPlanItems',
      'movePlanItem',
      'promotePlanItem',
      'demotePlanItem',
      'setPlanItemStatus',
    ]
    for (const kind of kinds) {
      const m = await enqueue(kind, {})
      expect(m.kind).toBe(kind)
    }
  })
})

describe('getAll', () => {
  it('returns an empty array when the queue is empty', async () => {
    const all = await getAll()
    expect(all).toEqual([])
  })

  it('returns mutations in enqueue order (by seq)', async () => {
    await enqueue('createPlanItem', { title: 'first' })
    await enqueue('updatePlanItem', { title: 'second' })
    await enqueue('setPlanItemStatus', { title: 'third' })

    const all = await getAll()

    expect(all).toHaveLength(3)
    expect(all[0].kind).toBe('createPlanItem')
    expect(all[1].kind).toBe('updatePlanItem')
    expect(all[2].kind).toBe('setPlanItemStatus')
    expect(all[0].seq).toBeLessThan(all[1].seq)
    expect(all[1].seq).toBeLessThan(all[2].seq)
  })

  it('persists payload faithfully', async () => {
    const payload = { tripId: 't99', itemIds: ['a', 'b', 'c'], nested: { x: 1 } }
    await enqueue('reorderPlanItems', payload)

    const [m] = await getAll()
    expect(m.payload).toEqual(payload)
  })
})

describe('remove', () => {
  it('removes a single mutation by id, leaving others intact', async () => {
    const a = await enqueue('createPlanItem', {})
    const b = await enqueue('updatePlanItem', {})

    await remove(a.id)

    const all = await getAll()
    expect(all).toHaveLength(1)
    expect(all[0].id).toBe(b.id)
  })

  it('is a no-op for an unknown id', async () => {
    await enqueue('createPlanItem', {})

    await expect(remove('nonexistent-id')).resolves.toBeUndefined()

    const all = await getAll()
    expect(all).toHaveLength(1)
  })
})

describe('clearQueue', () => {
  it('removes all pending mutations', async () => {
    await enqueue('createPlanItem', {})
    await enqueue('updatePlanItem', {})

    await clearQueue()

    const all = await getAll()
    expect(all).toHaveLength(0)
  })

  it('is a no-op on an already-empty queue', async () => {
    await expect(clearQueue()).resolves.toBeUndefined()
  })
})

describe('seq continuity across restarts', () => {
  it('seeds seq from the existing max so numbers stay monotonic after a reset', async () => {
    await enqueue('createPlanItem', {})
    await enqueue('updatePlanItem', {})
    // seq is now at 2 in the store

    // Simulate a page reload: reset the in-memory counter but keep the IDB data.
    await _resetForTesting()

    const c = await enqueue('setPlanItemStatus', {})
    // After reseeding from max(seq)=2, the next seq must be 3.
    expect(c.seq).toBe(3)
  })
})

describe('queue as a generic mechanism', () => {
  it('stores arbitrary payload shapes so Journal can reuse the same queue', async () => {
    // A hypothetical Journal mutation — the queue accepts any payload.
    const journalPayload = {
      entryId: 'entry-uuid',
      dayId: 'day-uuid',
      body: 'Had a great day at the market.',
    }
    const m = await enqueue('createPlanItem', journalPayload) // kind will be extended in M06
    const [stored] = await getAll()

    expect(stored.id).toBe(m.id)
    expect(stored.payload).toEqual(journalPayload)
  })
})

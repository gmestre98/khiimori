// Tests for the deterministic conflict-resolution strategy (M04.6 S3).
// resolveConflicts is a pure function — no IndexedDB needed.

import { describe, expect, it } from 'vitest'
import { resolveConflicts } from './conflictResolution'
import type { QueuedMutation } from './mutationQueue'

function make(
  seq: number,
  kind: QueuedMutation['kind'],
  payload: Record<string, unknown>,
): QueuedMutation {
  return {
    id: `id-${seq}`,
    seq,
    kind,
    payload,
    enqueuedAt: new Date(seq * 1000).toISOString(),
  }
}

// ---------------------------------------------------------------------------
// createPlanItem — never deduplicated
// ---------------------------------------------------------------------------

describe('resolveConflicts — createPlanItem', () => {
  it('preserves all creates regardless of tripId', () => {
    const mutations = [
      make(1, 'createPlanItem', { tripId: 't1', input: { title: 'A' } }),
      make(2, 'createPlanItem', { tripId: 't1', input: { title: 'B' } }),
    ]
    const { toDispatch, superseded } = resolveConflicts(mutations)
    expect(toDispatch).toHaveLength(2)
    expect(superseded).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// reorderPlanItems — dedup by (tripId, dayId); last seq wins
// ---------------------------------------------------------------------------

describe('resolveConflicts — reorderPlanItems convergence', () => {
  it('collapses two reorders for the same day to the last one', () => {
    const first = make(1, 'reorderPlanItems', { tripId: 't1', dayId: 'd1', itemIds: ['a', 'b'] })
    const last = make(2, 'reorderPlanItems', { tripId: 't1', dayId: 'd1', itemIds: ['b', 'a'] })

    const { toDispatch, superseded } = resolveConflicts([first, last])

    expect(toDispatch).toHaveLength(1)
    expect(toDispatch[0].id).toBe(last.id)
    expect(superseded).toHaveLength(1)
    expect(superseded[0].id).toBe(first.id)
  })

  it('keeps reorders for different days', () => {
    const a = make(1, 'reorderPlanItems', { tripId: 't1', dayId: 'd1', itemIds: ['x'] })
    const b = make(2, 'reorderPlanItems', { tripId: 't1', dayId: 'd2', itemIds: ['y'] })

    const { toDispatch, superseded } = resolveConflicts([a, b])

    expect(toDispatch).toHaveLength(2)
    expect(superseded).toHaveLength(0)
  })

  it('collapses three reorders for the same day to the last', () => {
    const m1 = make(1, 'reorderPlanItems', { tripId: 't1', dayId: 'd1', itemIds: ['a', 'b', 'c'] })
    const m2 = make(2, 'reorderPlanItems', { tripId: 't1', dayId: 'd1', itemIds: ['b', 'a', 'c'] })
    const m3 = make(3, 'reorderPlanItems', { tripId: 't1', dayId: 'd1', itemIds: ['c', 'b', 'a'] })

    const { toDispatch, superseded } = resolveConflicts([m1, m2, m3])

    expect(toDispatch).toHaveLength(1)
    expect(toDispatch[0].id).toBe(m3.id)
    expect(superseded).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// updatePlanItem — dedup by (tripId, itemId); last seq wins
// ---------------------------------------------------------------------------

describe('resolveConflicts — updatePlanItem LWW', () => {
  it('keeps only the last update for the same item', () => {
    const first = make(1, 'updatePlanItem', {
      tripId: 't1',
      itemId: 'i1',
      input: { title: 'First' },
    })
    const last = make(2, 'updatePlanItem', {
      tripId: 't1',
      itemId: 'i1',
      input: { title: 'Last' },
    })

    const { toDispatch, superseded } = resolveConflicts([first, last])

    expect(toDispatch).toHaveLength(1)
    expect(toDispatch[0].id).toBe(last.id)
    expect(superseded[0].id).toBe(first.id)
  })

  it('keeps updates for different items', () => {
    const a = make(1, 'updatePlanItem', { tripId: 't1', itemId: 'i1', input: { title: 'A' } })
    const b = make(2, 'updatePlanItem', { tripId: 't1', itemId: 'i2', input: { title: 'B' } })

    const { toDispatch } = resolveConflicts([a, b])

    expect(toDispatch).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// setPlanItemStatus — dedup by (tripId, itemId); last seq wins
// ---------------------------------------------------------------------------

describe('resolveConflicts — setPlanItemStatus LWW', () => {
  it('keeps only the last status write for the same item', () => {
    const first = make(1, 'setPlanItemStatus', { tripId: 't1', itemId: 'i1', status: 'planned' })
    const last = make(2, 'setPlanItemStatus', { tripId: 't1', itemId: 'i1', status: 'done' })

    const { toDispatch, superseded } = resolveConflicts([first, last])

    expect(toDispatch).toHaveLength(1)
    expect(toDispatch[0].id).toBe(last.id)
    expect(superseded[0].id).toBe(first.id)
  })
})

// ---------------------------------------------------------------------------
// movePlanItem / promotePlanItem / demotePlanItem — dedup by (tripId, itemId)
// ---------------------------------------------------------------------------

describe('resolveConflicts — move/promote/demote LWW', () => {
  it('keeps only the last movePlanItem for the same item', () => {
    const first = make(1, 'movePlanItem', { tripId: 't1', itemId: 'i1', dayId: 'day-a' })
    const last = make(2, 'movePlanItem', { tripId: 't1', itemId: 'i1', dayId: 'day-b' })

    const { toDispatch } = resolveConflicts([first, last])

    expect(toDispatch).toHaveLength(1)
    expect(toDispatch[0].id).toBe(last.id)
  })

  it('keeps only the last promotePlanItem for the same item', () => {
    const first = make(1, 'promotePlanItem', { tripId: 't1', itemId: 'i1', dayId: 'day-a' })
    const last = make(2, 'promotePlanItem', { tripId: 't1', itemId: 'i1', dayId: 'day-b' })

    const { toDispatch } = resolveConflicts([first, last])

    expect(toDispatch).toHaveLength(1)
    expect(toDispatch[0].id).toBe(last.id)
  })

  it('keeps only the last demotePlanItem for the same item', () => {
    const first = make(1, 'demotePlanItem', { tripId: 't1', itemId: 'i1' })
    const last = make(2, 'demotePlanItem', { tripId: 't1', itemId: 'i1' })

    const { toDispatch } = resolveConflicts([first, last])

    expect(toDispatch).toHaveLength(1)
    expect(toDispatch[0].id).toBe(last.id)
  })
})

// ---------------------------------------------------------------------------
// Mixed queue — seq order preserved among survivors
// ---------------------------------------------------------------------------

describe('resolveConflicts — mixed queue', () => {
  it('preserves seq order among surviving mutations', () => {
    const mutations = [
      make(1, 'createPlanItem', { tripId: 't1', input: { title: 'New' } }),
      make(2, 'reorderPlanItems', { tripId: 't1', dayId: 'd1', itemIds: ['a', 'b'] }),
      make(3, 'updatePlanItem', { tripId: 't1', itemId: 'i1', input: { title: 'Old' } }),
      make(4, 'reorderPlanItems', { tripId: 't1', dayId: 'd1', itemIds: ['b', 'a'] }), // supersedes seq=2
      make(5, 'updatePlanItem', { tripId: 't1', itemId: 'i1', input: { title: 'New' } }), // supersedes seq=3
    ]

    const { toDispatch, superseded } = resolveConflicts(mutations)

    expect(toDispatch).toHaveLength(3)
    expect(toDispatch.map((m) => m.seq)).toEqual([1, 4, 5])
    expect(superseded.map((m) => m.seq).sort((a, b) => a - b)).toEqual([2, 3])
  })

  it('returns empty arrays for an empty input', () => {
    const { toDispatch, superseded } = resolveConflicts([])
    expect(toDispatch).toHaveLength(0)
    expect(superseded).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Integration: replayQueue removes superseded mutations from the store
// ---------------------------------------------------------------------------
// This is tested in replayQueue.test.ts where the full IndexedDB stack is
// available. The tests below focus on the pure conflict-resolution logic.

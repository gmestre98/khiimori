// Conflict resolution strategy for the offline mutation queue (M04.6 S3).
//
// Strategy: Last-Write-Wins (LWW) by seq.
//
// When the queue accumulates multiple mutations targeting the same resource,
// only the one with the highest seq (the last enqueued) is dispatched. Earlier
// ones are superseded and removed without being sent to the server. This
// produces deterministic, convergent behaviour:
//
//   • updatePlanItem / setPlanItemStatus — last queued write for an item wins.
//     The server applies updates sequentially; only the final state matters.
//   • reorderPlanItems — last queued reorder per (tripId, dayId) wins.
//     Sending a stale intermediate order before the final one would cause the
//     day order to flicker and waste a round-trip.
//   • movePlanItem / promotePlanItem / demotePlanItem — last queued action per
//     itemId wins; an earlier location change is irrelevant once superseded.
//   • createPlanItem — no dedup. Each create carries a unique client-generated
//     id so every enqueued create is a distinct resource.
//
// Relative seq order among surviving mutations is preserved so the replay
// engine applies them in the user's intended sequence.
//
// The same strategy is shared with Milestone 06 (Journal) since both use the
// same queue/replay mechanism.

import type { QueuedMutation } from './mutationQueue'

// resourceKey returns a string that uniquely identifies the resource targeted
// by a mutation. Mutations with the same key compete; the last (by seq) wins.
// Returns null for mutations that are never deduplicated (e.g. createPlanItem).
function resourceKey(m: QueuedMutation): string | null {
  const p = m.payload as Record<string, unknown>
  switch (m.kind) {
    case 'updatePlanItem':
      return `updatePlanItem:${String(p.tripId)}:${String(p.itemId)}`
    case 'setPlanItemStatus':
      return `setPlanItemStatus:${String(p.tripId)}:${String(p.itemId)}`
    case 'reorderPlanItems':
      return `reorderPlanItems:${String(p.tripId)}:${String(p.dayId)}`
    case 'movePlanItem':
      return `movePlanItem:${String(p.tripId)}:${String(p.itemId)}`
    case 'promotePlanItem':
      return `promotePlanItem:${String(p.tripId)}:${String(p.itemId)}`
    case 'demotePlanItem':
      return `demotePlanItem:${String(p.tripId)}:${String(p.itemId)}`
    case 'createPlanItem':
    default:
      return null
  }
}

// ConflictResolutionResult separates the mutations that should be dispatched
// from those that were superseded and should be dropped from the queue.
export interface ConflictResolutionResult {
  toDispatch: QueuedMutation[]
  superseded: QueuedMutation[]
}

// resolveConflicts applies the LWW-by-seq strategy to a list of pending
// mutations (assumed to be pre-sorted by seq ascending, as getAll() returns).
// Returns the surviving set to dispatch and the set to discard.
export function resolveConflicts(mutations: QueuedMutation[]): ConflictResolutionResult {
  // For each resource key, track the mutation with the highest seq seen so far.
  const winners = new Map<string, QueuedMutation>()

  for (const m of mutations) {
    const key = resourceKey(m)
    if (key === null) continue // creates are never deduplicated

    const current = winners.get(key)
    if (current === undefined || m.seq > current.seq) {
      winners.set(key, m)
    }
  }

  const superseded: QueuedMutation[] = []
  const toDispatch: QueuedMutation[] = []

  for (const m of mutations) {
    const key = resourceKey(m)
    if (key === null) {
      toDispatch.push(m)
      continue
    }
    if (winners.get(key)?.id === m.id) {
      toDispatch.push(m)
    } else {
      superseded.push(m)
    }
  }

  // toDispatch preserves the original seq order (mutations was already sorted).
  return { toDispatch, superseded }
}

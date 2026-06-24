// Replay engine for the offline mutation queue (M04.6 S2).
//
// When connectivity returns, replayQueue() reads every pending mutation from
// the IndexedDB queue (S1) and dispatches each one to the matching API
// function in seq order. Successfully applied mutations are removed from the
// queue. Permanent failures (4xx) are also removed (the server rejected them);
// transient failures (network, 5xx) leave the mutation in the queue so the
// next reconnect retries.
//
// startReplayOnReconnect() wires connectivity detection: it listens for the
// browser's 'online' event and triggers replay. Call it once at app start.
// stopReplayOnReconnect() tears down the listener (useful in tests).
//
// Design note: the module imports API functions directly so it stays free of
// any React dependency. The Journal (Milestone 06) will extend MutationKind
// and add its own handler entries here without changing the replay loop.

import * as api from './api'
import { getAll, remove, type QueuedMutation } from './mutationQueue'
import { resolveConflicts } from './conflictResolution'

// ReplayResult summarises what happened to a single queued mutation during replay.
export type ReplayOutcome = 'success' | 'permanent_failure' | 'transient_failure'

export interface ReplayResult {
  id: string
  seq: number
  kind: QueuedMutation['kind']
  outcome: ReplayOutcome
  error?: unknown
}

// ReplayError is thrown by replayQueue when one or more mutations produced a
// transient failure so the caller can decide whether to show a toast, etc.
export class ReplayError extends Error {
  results: ReplayResult[]
  constructor(results: ReplayResult[]) {
    super(
      `${results.filter((r) => r.outcome === 'transient_failure').length} mutation(s) failed to replay`,
    )
    this.name = 'ReplayError'
    this.results = results
  }
}

// Payload shapes — each matches what the corresponding `enqueue` call provides.
interface CreatePlanItemPayload {
  tripId: string
  input: api.PlanItemInput
}

interface UpdatePlanItemPayload {
  tripId: string
  itemId: string
  input: api.PlanItemInput
}

interface ReorderPlanItemsPayload {
  tripId: string
  dayId: string
  itemIds: string[]
}

interface MovePlanItemPayload {
  tripId: string
  itemId: string
  dayId: string
  startTime?: string
}

interface PromotePlanItemPayload {
  tripId: string
  itemId: string
  dayId: string
  startTime?: string
}

interface DemotePlanItemPayload {
  tripId: string
  itemId: string
}

interface SetPlanItemStatusPayload {
  tripId: string
  itemId: string
  status: string
}

// isPermanentFailure returns true for HTTP status codes that indicate the server
// definitively rejected the mutation (not a transient issue). 401 is treated as
// permanent so an expired session doesn't block the queue forever; re-auth and
// a fresh action will re-enqueue the write.
function isPermanentFailure(err: unknown): boolean {
  if (err instanceof api.UnauthorizedError) return true
  if (err instanceof api.PlanItemValidationError) return true
  if (err instanceof Error && /^API returned HTTP (4\d\d)$/.test(err.message)) return true
  return false
}

// dispatch calls the right API function for a single queued mutation and returns
// the promise. Throws on failure so the caller can classify the error.
async function dispatch(m: QueuedMutation): Promise<void> {
  const p = m.payload as Record<string, unknown>
  switch (m.kind) {
    case 'createPlanItem': {
      const { tripId, input } = p as unknown as CreatePlanItemPayload
      await api.createPlanItem(tripId, input)
      return
    }
    case 'updatePlanItem': {
      const { tripId, itemId, input } = p as unknown as UpdatePlanItemPayload
      await api.updatePlanItem(tripId, itemId, input)
      return
    }
    case 'reorderPlanItems': {
      const { tripId, dayId, itemIds } = p as unknown as ReorderPlanItemsPayload
      await api.reorderPlanItems(tripId, dayId, itemIds)
      return
    }
    case 'movePlanItem': {
      const { tripId, itemId, dayId, startTime } = p as unknown as MovePlanItemPayload
      await api.movePlanItem(tripId, itemId, dayId, startTime)
      return
    }
    case 'promotePlanItem': {
      const { tripId, itemId, dayId, startTime } = p as unknown as PromotePlanItemPayload
      await api.promotePlanItem(tripId, itemId, dayId, startTime)
      return
    }
    case 'demotePlanItem': {
      const { tripId, itemId } = p as unknown as DemotePlanItemPayload
      await api.demotePlanItem(tripId, itemId)
      return
    }
    case 'setPlanItemStatus': {
      const { tripId, itemId, status } = p as unknown as SetPlanItemStatusPayload
      await api.setPlanItemStatus(tripId, itemId, status)
      return
    }
    default: {
      // Unknown kind — treat as permanent so it doesn't clog the queue.
      throw new api.PlanItemValidationError(
        `unknown mutation kind: ${String((m as QueuedMutation).kind)}`,
      )
    }
  }
}

// replayQueue reads all pending mutations in seq order, applies each one, and
// removes it on success or permanent failure. Returns the full list of results.
// Throws ReplayError if any mutation experienced a transient failure.
export async function replayQueue(): Promise<ReplayResult[]> {
  const pending = await getAll()
  if (pending.length === 0) return []

  const { toDispatch, superseded } = resolveConflicts(pending)

  // Drop superseded mutations immediately so they are never retried.
  // IDB errors here are unrecoverable (corrupted store); let them propagate
  // rather than silently proceeding with a partially-cleaned queue.
  for (const m of superseded) {
    await remove(m.id)
  }

  const results: ReplayResult[] = []

  for (const m of toDispatch) {
    let outcome: ReplayOutcome
    let error: unknown
    try {
      await dispatch(m)
      outcome = 'success'
    } catch (err) {
      error = err
      outcome = isPermanentFailure(err) ? 'permanent_failure' : 'transient_failure'
    }

    if (outcome !== 'transient_failure') {
      await remove(m.id)
    }

    results.push({ id: m.id, seq: m.seq, kind: m.kind, outcome, error })
  }

  const hasTransient = results.some((r) => r.outcome === 'transient_failure')
  if (hasTransient) {
    throw new ReplayError(results)
  }

  return results
}

// --- Connectivity detection --------------------------------------------------

let _replayHandler: (() => void) | null = null

// startReplayOnReconnect registers a window 'online' listener that triggers
// replayQueue() whenever the browser regains connectivity. Call once at app
// start. If replay throws (transient failures), errors are logged but not
// re-thrown — the next reconnect will retry the remaining queue items.
export function startReplayOnReconnect(
  onReplay?: (results: ReplayResult[]) => void,
  onError?: (err: ReplayError) => void,
): void {
  if (_replayHandler) return // already registered
  _replayHandler = () => {
    replayQueue()
      .then((results) => {
        if (results.length > 0) onReplay?.(results)
      })
      .catch((err: unknown) => {
        if (err instanceof ReplayError) onError?.(err)
      })
  }
  window.addEventListener('online', _replayHandler)
}

// stopReplayOnReconnect removes the 'online' listener. Useful in tests and on
// app teardown.
export function stopReplayOnReconnect(): void {
  if (_replayHandler) {
    window.removeEventListener('online', _replayHandler)
    _replayHandler = null
  }
}

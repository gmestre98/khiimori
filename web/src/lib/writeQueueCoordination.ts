// Offline write-queue coordination (M09.4 S4).
//
// This is the PWA's single integration point for the offline write queue. It
// does NOT define the queue or replay semantics — those are owned by
// Milestone 04 (mutationQueue + replayQueue) and reused verbatim by Milestone
// 06 (Journal). This module just drives that one queue from the app lifecycle:
//
//   1. Reconnect replay — reuses M04's startReplayOnReconnect (the window
//      'online' listener that runs replayQueue()).
//   2. Cold-start drain — when the app opens already online with writes left
//      over from a previous offline session, no 'online' event fires, so we
//      replay once on start if the queue is non-empty.
//
// One mechanism across Planning (M04), Journal (M06), and the PWA shell: every
// offline write goes through `enqueue(kind, payload)` and is replayed by
// `replayQueue()`. New write kinds plug in by extending MutationKind and adding
// a dispatch case in replayQueue — they need no second queue and no changes
// here.

import { getAll } from './mutationQueue'
import {
  replayQueue,
  startReplayOnReconnect,
  stopReplayOnReconnect,
  ReplayError,
  type ReplayResult,
} from './replayQueue'

// startWriteQueueCoordination wires the single offline write queue into the app
// lifecycle. Call once at startup (within the authenticated app). Returns a
// teardown function that removes the reconnect listener.
//
//   onReplay  — invoked after a replay that processed at least one mutation.
//   onError   — invoked when a replay had transient failures (will retry on the
//               next reconnect); the queue keeps those items.
export function startWriteQueueCoordination(
  onReplay?: (results: ReplayResult[]) => void,
  onError?: (err: ReplayError) => void,
): () => void {
  // Reconnect-driven replay (M04's mechanism, reused verbatim).
  startReplayOnReconnect(onReplay, onError)

  // Cold-start drain: reopened online with a queue from a prior offline session.
  if (navigator.onLine) {
    void getAll()
      .then((pending) => {
        if (pending.length === 0) return
        return replayQueue()
          .then((results) => {
            if (results.length > 0) onReplay?.(results)
          })
          .catch((err: unknown) => {
            if (err instanceof ReplayError) onError?.(err)
          })
      })
      // IndexedDB may be unavailable (private mode) or the read may fail — there
      // is then nothing to drain on start, and reconnect replay still covers
      // future writes. Never surface this as an unhandled rejection.
      .catch(() => {})
  }

  return stopReplayOnReconnect
}

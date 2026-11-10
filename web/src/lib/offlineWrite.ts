// writeOrQueue: send a write now, or keep it in the offline queue.
//
// The phone's online flag isn't enough on plane or hotel wifi: it says
// "online" while requests fail, hang, or come back as a login page. So a write
// is queued when the phone is offline, when it fails for a network reason
// (fetch error, timeout, non-JSON reply, 5xx), and while older queued writes
// are still waiting (so changes reach the server in the order they were made).
// Queued writes replay through the one queue (replayQueue) when the connection
// works again. Every queued write here is safe to send twice: creates carry a
// client-made id, updates are partial patches of final values, and deletes
// treat "already gone" as done.

import {
  PackingValidationError,
  PlanItemValidationError,
  StayValidationError,
  UnauthorizedError,
} from './api'
import { enqueue, getAll, type MutationKind } from './mutationQueue'

export const WRITE_TIMEOUT_MS = 15000

// QUEUED_EVENT is dispatched on window when a write was queued, so the sync
// status can say so and start retrying.
export const QUEUED_EVENT = 'khiimori:queued'

export class WriteTimeoutError extends Error {
  constructor() {
    super('The request took too long')
    this.name = 'WriteTimeoutError'
  }
}

// isNetworkFailure tells a connection problem (worth queueing and retrying)
// from an answer the server actually gave (shown to the user).
export function isNetworkFailure(err: unknown): boolean {
  if (
    err instanceof UnauthorizedError ||
    err instanceof PackingValidationError ||
    err instanceof PlanItemValidationError ||
    err instanceof StayValidationError
  ) {
    return false
  }
  if (err instanceof WriteTimeoutError) return true
  if (err instanceof TypeError) return true // fetch could not reach the server
  if (err instanceof SyntaxError) return true // a wifi login page instead of JSON
  if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
    return true
  }
  if (err instanceof Error && /^API returned HTTP 5\d\d$/.test(err.message)) return true
  return false
}

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new WriteTimeoutError()), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e: unknown) => {
        clearTimeout(t)
        reject(e instanceof Error ? e : new Error(String(e)))
      },
    )
  })
}

async function queue(kind: MutationKind, payload: unknown): Promise<null> {
  await enqueue(kind, payload)
  window.dispatchEvent(new CustomEvent(QUEUED_EVENT))
  return null
}

async function queueIsEmpty(): Promise<boolean> {
  try {
    return (await getAll()).length === 0
  } catch {
    return true // no IndexedDB: nothing can be waiting
  }
}

// writeOrQueue returns the server's result, or null when the write was queued
// (the caller keeps its optimistic local change). Errors the server returned
// (validation, 4xx, signed out) are re-thrown for the caller to show.
export async function writeOrQueue<T>(
  kind: MutationKind,
  payload: unknown,
  call: () => Promise<T>,
  timeoutMs = WRITE_TIMEOUT_MS,
): Promise<T | null> {
  if (!navigator.onLine || !(await queueIsEmpty())) return queue(kind, payload)
  try {
    return await withTimeout(call(), timeoutMs)
  } catch (err) {
    if (isNetworkFailure(err)) return queue(kind, payload)
    throw err
  }
}

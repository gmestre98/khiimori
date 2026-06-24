// Client-side mutation queue backed by IndexedDB (M04.6 S1).
//
// Mutations issued while offline are persisted here so S2 (replay) can
// apply them in order when connectivity returns. The record format is
// intentionally generic — Milestone 06 (Journal) reuses the same store.
//
// Nothing in this module talks to the server; server interaction is S2's job.

const DB_NAME = 'khiimori-mutations'
const DB_VERSION = 1
const STORE_NAME = 'mutations'

// MutationKind enumerates every write intent the app can queue.
// Planning mutations cover Epics 02–05; Journal mutations will extend this
// union in Milestone 06 without changing the queue schema.
export type MutationKind =
  | 'createPlanItem'
  | 'updatePlanItem'
  | 'reorderPlanItems'
  | 'movePlanItem'
  | 'promotePlanItem'
  | 'demotePlanItem'
  | 'setPlanItemStatus'
  | 'setTripBudgetLine'
  | 'setDayBudgetLine'
  | 'createCostEntry'
  | 'updateCostEntry'
  | 'deleteCostEntry'

// QueuedMutation is the persisted record shape. It is designed to be
// replayed verbatim: kind + payload carry enough data to reconstruct the
// exact API call (S2), and seq provides a stable replay order even across
// browser restarts.
export interface QueuedMutation {
  // Stable client-generated identifier — safe to use as the idempotency key
  // on the server (S2/S3). Never reused, never assigned by the server.
  id: string
  // Monotonically increasing sequence number across the lifetime of the queue.
  // S2 sorts by seq to apply mutations in the order they were enqueued.
  seq: number
  kind: MutationKind
  // Mutation-specific data; S2 interprets this by kind.
  payload: unknown
  enqueuedAt: string
}

let _dbPromise: Promise<IDBDatabase> | null = null
let _seqCounter = 0

function openDB(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise
  _dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        // Index by seq so getAll() can return records in enqueue order.
        store.createIndex('seq', 'seq', { unique: true })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return _dbPromise
}

// nextSeq returns the next sequence number. On the first call it seeds from
// the current max seq in the store so numbers stay monotonic across reloads.
// _seqCounter is set to -1 as a sentinel before the async seed so concurrent
// callers skip re-entry and increment from wherever the seeding lands.
async function nextSeq(): Promise<number> {
  if (_seqCounter === 0) {
    _seqCounter = -1 // sentinel: seeding in progress
    const existing = await getAll()
    _seqCounter = existing.reduce((max, m) => Math.max(max, m.seq), 0)
  }
  return ++_seqCounter
}

// enqueue persists a new mutation to the local store and returns the record.
// Call this instead of the API function when offline; S2 will replay it.
export async function enqueue(kind: MutationKind, payload: unknown): Promise<QueuedMutation> {
  const db = await openDB()
  const seq = await nextSeq()
  const mutation: QueuedMutation = {
    id: crypto.randomUUID(),
    seq,
    kind,
    payload,
    enqueuedAt: new Date().toISOString(),
  }
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const req = tx.objectStore(STORE_NAME).add(mutation)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
  return mutation
}

// getAll returns all queued mutations sorted by seq (enqueue order).
export async function getAll(): Promise<QueuedMutation[]> {
  const db = await openDB()
  return new Promise<QueuedMutation[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).index('seq').getAll()
    req.onsuccess = () => resolve(req.result as QueuedMutation[])
    req.onerror = () => reject(req.error)
  })
}

// remove deletes a single mutation by id. S2 calls this after a successful
// replay so the item is not replayed again.
export async function remove(id: string): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const req = tx.objectStore(STORE_NAME).delete(id)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

// clearQueue removes every pending mutation. Useful after a full sync or in
// conflict-resolution scenarios (S3) where the server state is authoritative.
export async function clearQueue(): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const req = tx.objectStore(STORE_NAME).clear()
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

// _resetForTesting closes the cached DB handle and resets the seq counter so
// test suites start from a clean state. Never call this in production code.
// Returns a Promise so callers can await the close before the next test opens
// a fresh handle (avoids InvalidStateError from a still-closing connection).
export async function _resetForTesting(): Promise<void> {
  if (_dbPromise) {
    const db = await _dbPromise.catch(() => null)
    db?.close()
    _dbPromise = null
  }
  _seqCounter = 0
}

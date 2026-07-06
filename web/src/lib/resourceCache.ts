// On-device cache for API-read payloads (M11.1 S1).
//
// A tiny promise-based IndexedDB key/value store that holds the last-known
// response of a GET-style API read, keyed by a stable resource key (e.g.
// `GET /trips/<id>/days/<date>`). It exists so screens can render the user's
// last-known data *instantly* (see useCachedResource) instead of waiting for
// the backend — which scales to zero and therefore cold-starts on the first
// request after idle. The cache also makes reads survive a reload / restart and
// keeps them available offline, across every trip the user has opened.
//
// Hand-rolled on the browser's native IndexedDB (no deps, PRD §7.0), mirroring
// the openDB() pattern in mutationQueue.ts. Storage is unbounded by design: the
// app is used by a handful of people, and "data available" matters more than a
// few hundred KB of JSON; clearCache() wipes it on sign-out.
//
// Nothing here talks to the server. It never throws to the caller: when
// IndexedDB is unavailable (private-mode quirks, tests, unsupported browsers) it
// transparently falls back to an in-memory Map so callers always get a value or
// null, never an exception.

const DB_NAME = 'khiimori-cache'
const DB_VERSION = 1
const STORE_NAME = 'resources'

// SCHEMA tags every stored entry. Bump it when a cached payload's shape changes
// so stale-shaped entries are ignored on read (a zero-migration invalidation) —
// the next fetch simply repopulates the key under the new schema.
const SCHEMA = 1

// CacheEntry is the persisted record. `data` is the raw parsed API payload;
// `cachedAt` (epoch ms) lets callers show "saved N ago" and reason about age.
interface CacheEntry {
  key: string
  data: unknown
  cachedAt: number
  schema: number
}

// CachedValue is what readCache returns on a hit: the payload plus its age.
export interface CachedValue<T> {
  data: T
  cachedAt: number
}

// hasIndexedDB reports whether a usable IndexedDB is present. Guarded access so
// merely importing this module never throws in a non-browser context.
function hasIndexedDB(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    return false
  }
}

// memoryStore is the fallback when IndexedDB is unavailable. Same-tab only and
// non-persistent, but it keeps the SWR logic working (and tests deterministic)
// without special-casing every call site.
const memoryStore = new Map<string, CacheEntry>()

let _dbPromise: Promise<IDBDatabase> | null = null

// openDB opens (and lazily creates) the cache database, caching the promise so
// concurrent callers share one connection. Rejects if IndexedDB errors, which
// the callers below catch and translate into the in-memory fallback.
function openDB(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise
  _dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return _dbPromise
}

// withStore runs `op` against the object store inside one transaction and
// resolves with its result. Any failure (including IndexedDB being unavailable)
// rejects so the public functions can fall back to the in-memory store.
function withStore<T>(
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode)
        const req = op(tx.objectStore(STORE_NAME))
        req.onsuccess = () => resolve(req.result as T)
        req.onerror = () => reject(req.error)
      }),
  )
}

// readCache returns the cached value for `key`, or null on a miss. Entries
// written under a different SCHEMA are treated as a miss (stale shape). Never
// throws: an IndexedDB error falls back to the in-memory store.
export async function readCache<T>(key: string): Promise<CachedValue<T> | null> {
  const toValue = (entry: CacheEntry | undefined): CachedValue<T> | null => {
    if (!entry || entry.schema !== SCHEMA) return null
    return { data: entry.data as T, cachedAt: entry.cachedAt }
  }
  if (!hasIndexedDB()) return toValue(memoryStore.get(key))
  try {
    const entry = await withStore<CacheEntry | undefined>('readonly', (s) => s.get(key))
    return toValue(entry)
  } catch {
    return toValue(memoryStore.get(key))
  }
}

// writeCache stores `data` under `key`, stamped with the current time and
// SCHEMA. Never throws: on IndexedDB failure it writes to the in-memory store.
export async function writeCache(key: string, data: unknown): Promise<void> {
  const entry: CacheEntry = { key, data, cachedAt: Date.now(), schema: SCHEMA }
  if (!hasIndexedDB()) {
    memoryStore.set(key, entry)
    return
  }
  try {
    await withStore('readwrite', (s) => s.put(entry))
  } catch {
    memoryStore.set(key, entry)
  }
}

// deleteCache removes a single key (e.g. after the resource is deleted).
export async function deleteCache(key: string): Promise<void> {
  memoryStore.delete(key)
  if (!hasIndexedDB()) return
  try {
    await withStore('readwrite', (s) => s.delete(key))
  } catch {
    // Already removed from the in-memory fallback above; best effort.
  }
}

// clearCache wipes every cached entry — call on sign-out so one user's cached
// data never bleeds into the next session on a shared device.
export async function clearCache(): Promise<void> {
  memoryStore.clear()
  if (!hasIndexedDB()) return
  try {
    await withStore('readwrite', (s) => s.clear())
  } catch {
    // Best effort; the in-memory fallback is already cleared.
  }
}

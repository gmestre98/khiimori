// Tests for the on-device API-read cache (M11.1 S1).
// fake-indexeddb/auto patches globalThis.indexedDB so the module runs under
// Node/jsdom without a real browser.

import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readCache, writeCache, deleteCache, clearCache } from './resourceCache'

afterEach(async () => {
  await clearCache().catch(() => {})
  vi.unstubAllGlobals()
})

// putRaw writes a record straight into the object store, bypassing writeCache,
// so a test can seed an entry stamped with an arbitrary schema.
function putRaw(entry: {
  key: string
  data: unknown
  cachedAt: number
  schema: number
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('khiimori-cache', 1)
    open.onupgradeneeded = () => {
      const db = open.result
      if (!db.objectStoreNames.contains('resources')) {
        db.createObjectStore('resources', { keyPath: 'key' })
      }
    }
    open.onsuccess = () => {
      const db = open.result
      const tx = db.transaction('resources', 'readwrite')
      const req = tx.objectStore('resources').put(entry)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    }
    open.onerror = () => reject(open.error)
  })
}

describe('resourceCache (IndexedDB)', () => {
  it('round-trips a written value with its cachedAt timestamp', async () => {
    const before = Date.now()
    await writeCache('GET /trips', { current: [{ id: 't1' }] })
    const hit = await readCache<{ current: { id: string }[] }>('GET /trips')

    expect(hit).not.toBeNull()
    expect(hit?.data.current[0].id).toBe('t1')
    expect(hit?.cachedAt).toBeGreaterThanOrEqual(before)
  })

  it('returns null on a miss', async () => {
    expect(await readCache('GET /nope')).toBeNull()
  })

  it('overwrites an existing key', async () => {
    await writeCache('k', { v: 1 })
    await writeCache('k', { v: 2 })
    const hit = await readCache<{ v: number }>('k')
    expect(hit?.data.v).toBe(2)
  })

  it('ignores an entry stored under a different schema (stale shape)', async () => {
    await putRaw({ key: 'k', data: { v: 'old' }, cachedAt: Date.now(), schema: 999 })
    expect(await readCache('k')).toBeNull()
  })

  it('deleteCache removes a single key', async () => {
    await writeCache('k', { v: 1 })
    await deleteCache('k')
    expect(await readCache('k')).toBeNull()
  })

  it('clearCache wipes every entry', async () => {
    await writeCache('a', 1)
    await writeCache('b', 2)
    await clearCache()
    expect(await readCache('a')).toBeNull()
    expect(await readCache('b')).toBeNull()
  })
})

describe('resourceCache (in-memory fallback)', () => {
  it('still round-trips when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined)
    await writeCache('mem', { v: 42 })
    const hit = await readCache<{ v: number }>('mem')
    expect(hit?.data.v).toBe(42)
    await deleteCache('mem')
    expect(await readCache('mem')).toBeNull()
  })
})

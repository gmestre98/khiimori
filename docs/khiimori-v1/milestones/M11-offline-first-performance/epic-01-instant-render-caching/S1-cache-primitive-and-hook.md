# Story M11.1-S1 — IndexedDB cache primitive + SWR hook

**Epic:** [M11.1 Instant-render caching](README.md) · **Est.** ~3h · **Epic AC:** AC1, AC2, AC5, AC6

## Goal

Add the two foundational modules with **no behaviour change** to any screen yet:

1. `web/src/lib/resourceCache.ts` — a promise-based **IndexedDB** key/value cache for API-read
   payloads.
2. `web/src/lib/useCachedResource.ts` — a **stale-while-revalidate** React hook built on it.

## Requirements

### `resourceCache.ts`

- Single IndexedDB database (`khiimori-cache`), one object store keyed by a **string resource key**.
  Value shape: `{ key, data: unknown, cachedAt: number, schema: number }`.
- API:
  - `readCache<T>(key): Promise<{ data: T; cachedAt: number } | null>`
  - `writeCache(key, data): Promise<void>`
  - `deleteCache(key): Promise<void>`
  - `clearCache(): Promise<void>` (e.g. on sign-out)
- A module-level `SCHEMA` integer; entries written under a different schema are ignored on read
  (lets a payload-shape change invalidate old data without a migration).
- **Never throws** to the caller: if `indexedDB` is unavailable (or errors), fall back to an
  in-memory `Map` so reads/writes degrade gracefully. Follow the `openDB()` pattern in
  `mutationQueue.ts` (cached DB promise, `onupgradeneeded` creates the store).

### `useCachedResource.ts`

- Signature: `useCachedResource<T>(key: string | null, fetcher: (signal: AbortSignal) => Promise<T>)`
  → `{ data: T | null; isValidating: boolean; error: Error | null; fromCache: boolean; refresh: () => void }`.
- Behaviour:
  - `key === null` → idle (no fetch, no cache read) — supports conditional/deferred loads.
  - On mount / key change: read cache; if hit, set `data` + `fromCache = true` immediately. Then call
    `fetcher`; on success `writeCache` + set fresh `data` + `fromCache = false`; on error **keep**
    cached `data` and set `error` only when there is no cached data.
  - Abort the in-flight fetch on unmount / key change (`AbortController`).
  - `refresh()` re-runs the fetcher for the current key (used after a mutation).
  - Ignore `AbortError`. Let `UnauthorizedError` propagate as `error` (the central 401 handler in
    `apiFetch` already reacts); do not cache on error.

## Tests (Vitest, `fake-indexeddb`)

- `resourceCache.test.ts`: write→read round-trip; miss returns null; schema mismatch ignored;
  delete/clear; in-memory fallback path when `indexedDB` is undefined.
- `useCachedResource.test.tsx`: cache-hit renders cached data before fetch resolves; fetch success
  updates data + `fromCache=false`; fetch failure with a cached value keeps data + no error; failure
  with no cache surfaces `error`; `key=null` stays idle; `refresh()` refetches.

## Out of scope

No screen migration (that's S2). No service-worker changes.

## Definition of done

- Both modules + tests added; `npm run test`, `npm run lint`, `npm run build`, and
  `npm run format:check` all green. No new dependencies. Self-review loop, then merge.

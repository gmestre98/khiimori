// Stale-while-revalidate data hook (M11.1 S1).
//
// useCachedResource is the app-layer read primitive that makes screens feel
// instant. It renders the last-known payload for a resource key from the
// on-device cache (resourceCache) on first paint, then fetches fresh data in the
// background and swaps it in when it arrives. This hides the backend cold start
// (Cloud Run + Neon scale to zero for the €0/month-idle goal), keeps reads
// available on a weak or absent connection, and works across every trip the user
// has opened — not just the active one.
//
// It sits *above* apiFetch: it changes nothing about auth (a 401 still routes
// through the central unauthorized handler inside apiFetch) or the write path.
// Failures are non-destructive: if the fetch fails but a cached value exists, the
// cached value stays on screen and no error is surfaced; `error` is only set when
// there is nothing cached to show.

import { useCallback, useEffect, useRef, useState } from 'react'
import { readCache, writeCache } from './resourceCache'

// Fetcher resolves the fresh value for a key. It receives an AbortSignal so the
// hook can cancel an in-flight request on unmount or when the key changes.
export type Fetcher<T> = (signal: AbortSignal) => Promise<T>

// CachedResource is the hook's return shape.
export interface CachedResource<T> {
  // The value to render: cached first, replaced by fresh data when it lands.
  data: T | null
  // True while a background fetch is in flight (show a subtle "Updating…" hint,
  // never a full-screen spinner when `data` is already present).
  isValidating: boolean
  // Set only when the fetch failed AND there is no cached value to fall back to.
  error: Error | null
  // True when `data` currently comes from the cache rather than a fresh fetch.
  // Pairs with isValidating to render "showing saved data" affordances.
  fromCache: boolean
  // Re-run the fetcher for the current key (e.g. after a mutation). No-op when
  // the key is null.
  refresh: () => void
}

// State is the hook's internal record. `key` stamps which resource the data
// belongs to so a stale resolution (or a key change) can be ignored by comparing
// against the current key — that keeps all setState calls inside the async load
// (never synchronously in the effect) and prevents one key's data bleeding into
// another.
interface State<T> {
  key: string | null
  data: T | null
  isValidating: boolean
  error: Error | null
  fromCache: boolean
}

const IDLE: State<never> = {
  key: null,
  data: null,
  isValidating: false,
  error: null,
  fromCache: false,
}

// isAbortError detects a fetch cancelled via AbortController so the hook can
// ignore it (it is expected on unmount / key change, not a real failure).
function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

// useCachedResource loads `key` via `fetcher` with stale-while-revalidate
// semantics. Pass `key = null` to stay idle (conditional/deferred loads); the
// hook does nothing and returns empty state until a real key is supplied.
//
// The fetcher is intentionally NOT a dependency of the load effect: callers pass
// an inline closure that changes identity every render, and the key already
// captures everything that should trigger a reload. Reads use the latest fetcher
// via a ref so a stale closure is never called.
export function useCachedResource<T>(key: string | null, fetcher: Fetcher<T>): CachedResource<T> {
  const [state, setState] = useState<State<T>>(IDLE)

  // The fetcher closure changes identity every render (callers pass an inline
  // function), but the key already captures what should trigger a reload. Hold
  // the latest fetcher in a ref — synced in an effect (not during render, per the
  // hooks lint rules) — so the load effect can call it without depending on it.
  const fetcherRef = useRef(fetcher)
  useEffect(() => {
    fetcherRef.current = fetcher
  })

  // Bumping this re-runs the load effect for the current key (refresh()).
  const [refreshTick, setRefreshTick] = useState(0)
  const refresh = useCallback(() => setRefreshTick((n) => n + 1), [])

  // One SWR cycle per key (and per refresh): seed from cache, then revalidate.
  // State is only ever set inside the promise callbacks (never synchronously in
  // the effect body), and `done` guards every update so a resolution after
  // unmount / key change / refresh never writes stale data.
  useEffect(() => {
    if (key === null) return
    const controller = new AbortController()
    let done = false

    void readCache<T>(key).then((cached) => {
      if (done) return
      // Seed: cached value (if any) on screen, marked as such, and validating.
      setState({
        key,
        data: cached ? cached.data : null,
        isValidating: true,
        error: null,
        fromCache: cached !== null,
      })
      return fetcherRef.current(controller.signal).then(
        (fresh) => {
          if (done) return
          setState({ key, data: fresh, isValidating: false, error: null, fromCache: false })
          // Persist after committing to state so a cache write can never block
          // the render; failures inside writeCache are swallowed there.
          void writeCache(key, fresh)
        },
        (err: unknown) => {
          if (done || isAbortError(err)) return
          // Non-destructive: keep any cached value on screen; only surface an
          // error when there was nothing cached to show.
          setState({
            key,
            data: cached ? cached.data : null,
            isValidating: false,
            error: cached ? null : err instanceof Error ? err : new Error(String(err)),
            fromCache: cached !== null,
          })
        },
      )
    })

    return () => {
      done = true
      controller.abort()
    }
  }, [key, refreshTick])

  // Derive the return value. When idle (key null) or the committed state belongs
  // to a previous key (a key change whose load hasn't seeded yet), report empty
  // state rather than the prior resource's data.
  if (key === null) {
    return { data: null, isValidating: false, error: null, fromCache: false, refresh }
  }
  const current: State<T> = state.key === key ? state : { ...IDLE, key, isValidating: true }
  return {
    data: current.data,
    isValidating: current.isValidating,
    error: current.error,
    fromCache: current.fromCache,
    refresh,
  }
}

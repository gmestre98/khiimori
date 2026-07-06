# Epic M11.1 — Instant-render caching

> **Status:** 🚧 Planned — 3 stories.

> Milestone: [11 — Offline-First Performance](../README.md) · PRD refs: §6 (Offline), §7.0, §7.2, §8.6.

## Description

Make read screens render the user's **last-known data instantly** from an on-device store, then
**revalidate in the background** — so the backend **cold start** (Cloud Run + Neon scaling from zero,
kept for the €0-idle goal) is **invisible** for reads, weak connections show everything immediately,
and **offline viewing works across every trip the user has opened**, not just the active one.

The mechanism is a small **stale-while-revalidate (SWR)** layer over the browser's native
**IndexedDB**, hand-rolled per the no-deps rule (PRD §7.0) and modelled on the existing
`mutationQueue` module. It sits **above** `apiFetch`: components ask a hook for a resource by key; the
hook returns cached data synchronously-fast, fires the network fetch, and updates when fresh data
arrives. Writes are unchanged — they still queue via the offline write queue (M04.6 / M09.4); on
success the affected cache keys are refreshed.

**Estimated effort:** ~1.5–2 developer-days (one developer).

## Acceptance Criteria

- [ ] Read screens render **cached data on first paint** when a cached copy exists — no full-screen
      spinner while the backend cold-starts (PRD §6, §8.6). — S1 + S2
- [ ] Cached reads are persisted **on-device in IndexedDB** and survive a page reload / app restart,
      for **every trip the user has opened** (not bounded to one active trip) (PRD §6). — S1 + S2
- [ ] Reads are **stale-while-revalidate**: cached data shows immediately, then the screen updates
      silently when the background refresh completes; a **subtle affordance** tells the user when
      they're viewing saved data or a refresh is in flight (PRD §5.10, §6). — S2
- [ ] On a **weak or absent connection**, read screens still show the last-known data instead of an
      error/spinner; writes continue to queue (unchanged) (PRD §6). — S2 + S3
- [ ] The cache layer is **tested** (cache read/write/expire, SWR hook states) and the offline /
      weak-connection behaviour is **verified in a browser** (PRD §7.6). — S1 + S3
- [ ] **No new runtime dependencies**; the €0/month-idle cost posture is **unchanged** (no
      min-instances, no Neon autosuspend change) (PRD §7.0, §8.6). — S1

## Implementation Details / Architecture

- Part of the **`/web` React + TypeScript** app. Two new modules:
  - `lib/resourceCache.ts` — a promise-based IndexedDB key/value store for cached API-read payloads
    (one object store keyed by a stable resource key; value = `{ data, cachedAt }`). Falls back to an
    in-memory map when `indexedDB` is unavailable so it never throws. Mirrors the IDB-open pattern in
    `mutationQueue.ts`.
  - `lib/useCachedResource.ts` — the SWR hook: `useCachedResource(key, fetcher)` →
    `{ data, isValidating, error, fromCache, refresh }`. Reads cache → renders; fetches → writes cache
    + updates; on fetch error keeps cached data (surfacing `error` only when there's nothing cached).
- The hook sits **above `apiFetch`**; it does not change auth (401 still routes through the central
  unauthorized handler) or the write path. On a successful mutation, callers `refresh()` / invalidate
  the affected keys so the cache never serves data known to be stale.
- The **service worker is left as-is** for the app shell + hashed assets (M09.4). It no longer needs
  to own read-data caching for the UX — the app layer renders from IndexedDB directly — so its
  single-active-trip data cache becomes a harmless belt-and-suspenders (offline reads no longer depend
  on it). No SW changes are required by this epic.
- **Cache keying:** by request path (e.g. `GET /trips`, `GET /trips/:id/days/:date`) so keys are
  stable and human-auditable. A small schema/version tag lets a shape change invalidate old entries.

## Dependencies

- **Upstream:** M09.4 (service worker & offline shell), M04.6 (offline write queue), the `/web` data
  layer in `lib/api.ts`.
- **Downstream:** none required; a follow-up could extend the E2E suite (M10) with an instant-render
  assertion.

## Costs Impact

**Cost-neutral to cost-positive.** No infra change (€0-idle preserved). Fewer redundant reads against
the API/DB (served from cache) marginally reduce Cloud Run/Neon wake-ups.

## User stories

The epic is split into **3 small user stories**, each sized **≤4h for one developer** (implementation
+ tests + review). Each story file is a standalone, agent-ready prompt.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-cache-primitive-and-hook.md) | IndexedDB cache primitive + SWR hook | ~3h | AC1, AC2, AC5, AC6 | M09.4, `lib/api.ts` |
| [S2](S2-migrate-read-surfaces.md) | Migrate read surfaces to instant-render cache | ~4h | AC1–AC4 | S1 |
| [S3](S3-verify-offline-and-deploy.md) | Verify offline / weak-connection & deploy | ~2h | AC4, AC5 | S2 |

**Total:** ~9h (≈ 1.5–2 dev-days).

### Sequencing

```
S1 Cache primitive + SWR hook ── S2 Migrate read surfaces ── S3 Verify offline & deploy
```

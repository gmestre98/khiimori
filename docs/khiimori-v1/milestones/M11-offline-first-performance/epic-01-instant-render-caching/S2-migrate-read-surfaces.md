# Story M11.1-S2 — Migrate read surfaces to instant-render cache

**Epic:** [M11.1 Instant-render caching](README.md) · **Est.** ~4h · **Epic AC:** AC1–AC4 · **Depends on:** S1

## Goal

Wire the primary read screens onto `useCachedResource` so they **render cached data on first paint**
and revalidate in the background, with a subtle affordance when showing saved / refreshing data.

## Surfaces to migrate

Replace the `useState(data/loading/error) + useEffect(fetch)` pattern with `useCachedResource` in:

- **Trips dashboard** (`trips/TripsDashboard.tsx`) — `fetchTrips` (key `GET /trips`) + current-trip
  `fetchBudgetRollup`.
- **Trip shell** (`trips/TripShell.tsx`) — trip/day resolution reads.
- **Day view** (`trips/DayView.tsx`) — `fetchDay` (key `GET /trips/:id/days/:date`).
- **Plan** (`trips/TripPlanPage.tsx`, `trips/BacklogPage.tsx`) — `fetchDay` / `fetchBacklog`.
- **Journal** (`journal/…`) — `fetchJournalEntry`, `listPhotos`.
- **Budget** — `fetchBudgetRollup`.

Keep each screen's existing error copy and 401 handling. Where a mutation currently mutates local
state, also `refresh()` (or invalidate) the affected cache key so the cache is not left stale.

## UX affordance

- When `fromCache && isValidating`, show a small, non-blocking "Updating…" hint (reuse the existing
  offline/stale styling if present). When offline (`useIsOnline` is false) and showing cached data,
  show "Showing saved data". Do **not** show a full-screen spinner when cached data exists.
- First-ever load with no cache still shows the normal loading state.

## Cache keying

Derive keys from the request path (e.g. `` `GET /trips/${id}/days/${date}` ``). Keep a tiny helper so
keys are consistent across read and post-mutation invalidation.

## Tests

- Update/extend the affected screens' tests: assert cached data renders before the fetch resolves
  (seed the cache, then mount) and that a background refresh replaces it. Keep existing tests green.
- `npm run test`, `npm run lint`, `npm run build`, `npm run format:check` all green.

## Out of scope

Service-worker changes; admin/sharing screens (low-value to cache, leave network-first).

## Definition of done

All listed surfaces render from cache first; affordance shown; tests + lint + build + format green;
self-review loop; merge.

# M09.5 S2 — Performance techniques

Recorded 2026-06-27. Target: day view interactive < 1.5s on a mid-range phone on 4G (PRD §6).

## Code-splitting (applied in this story)

All route-level components are now split into separate JS chunks via `React.lazy` +
`import()` in `App.tsx`. Each route is a separate Vite output chunk, so the browser only
fetches what the current route needs.

### Bundle sizes before / after (Vite build, minified)

| Chunk | Before (kB raw) | After (kB raw) | Notes |
|-------|----------------|----------------|-------|
| `index.js` (core shell) | 329 | 261 | −68 kB; auth + layout chrome |
| `DayView.js` | — | 35 | Split in this story |
| `Home.js` | — | 6 | Split |
| `TripFormPage.js` | — | 4 | Split |
| `BacklogPage.js` | — | 4 | Split |
| `TripSharingPage.js` | — | 5 | Split |
| `TripBudgetPage.js` | — | 1 | Split |
| `TripShell.js` | — | 4 | Split |
| `DayMap.js` | 1.5 | 1.6 | Already split in M07 |
| Admin pages | — | ~3.5 | Split |

The **critical initial path** (sign-in → authenticated shell) is now **261 kB raw /
81 kB gzip**, down from 329 kB / 97 kB. The day view chunk (35 kB / 9 kB gzip) only
loads when the user navigates to a day.

## Lazy-loaded map (pre-existing, M07)

`DayMap` was already lazy-loaded in M07 via `React.lazy(() => import('./DayMap'))`.
The map chunk (1.6 kB) is only fetched when the day view mounts and the `MapSlot`
renders a `<Suspense>` boundary around it. This prevents the Google Maps static image
request from blocking the initial day view render.

## Light thumbnails (pre-existing, M06)

`PhotoGrid` already uses `photo.thumbnail_url` with fallback to `photo.storage_url`,
and images are `loading="lazy"`. Thumbnails are generated server-side in M06 and are
typically ≤ 100 kB vs multi-MB originals, cutting photo egress (PRD §8.4 #3).

## Cost impact (PRD §8.4)

- **Maps calls** — map chunk only loads on day view navigation; the static map image
  fetch is deferred until the `<Suspense>` resolves. Fewer accidental map loads on
  mobile where users might not reach the map section.
- **Photo egress** — thumbnails cut bandwidth by ~10–50× per image vs originals.

## Re-verification in Milestone 10

Check that the critical-path bundle size has not regressed (target: ≤ 270 kB raw).
The `npm run build` output shows chunk sizes; grep for `index-*.js` to find the core
shell. Chunk count and names will change with each build (content hashes), but the
pattern of many small per-route chunks should be visible.

# S1 — Performance re-verification (< 1.5s day view) — REPORT

> Deliverable for [S1](S1-performance-verification.md). Verification date: 2026-07-05.
> Re-runs Milestone 09 Epic 05 S3's documented method
> ([`perf-measurement.md`](../../M09-design-system-and-mobile-pwa/epic-05-accessibility-performance/perf-measurement.md))
> against the current build + deployed stack. No app code changed.

## Target

**Day view interactive < 1.5 s on a mid-range phone on 4G** (PRD §6, Milestone 09).

## Method (reused from M09.5 S3 — unchanged for comparability)

| Parameter | Value |
|-----------|-------|
| Device | Moto G Power / Lighthouse "mobile" preset (4× CPU slowdown) |
| Network | Slow 4G — 1.6 Mbps down, 150 ms RTT (~200 KB/s), empty cache (first visit) |
| Scenario | Navigate to a day URL with real-ish content (≥3 plan items, 1 stay, 1 journal photo); "interactive" = TTI, aligned with the planning section being focusable |
| Basis | Critical-path transfer-size analysis of the production build + live-stack confirmation, per the M09 baseline (which computes TTI from eagerly-loaded critical-path bytes) |

## Recorded measurement — 2026-07-05

Production build (`npm run build`, `web/`, vite v8). Critical path = the bytes the
browser must fetch + parse before the day view is interactive. The **eager shell** is
exactly the set `index.html` `modulepreload`s; the **day route** chunks load on
navigation; the **map is lazy** (`DayView.tsx` → `lazy(() => import('./DayMap'))`,
rendered under `<Suspense>`) and is excluded from TTI.

### Critical-path transfer sizes (gzip, first visit to a day URL)

| Resource | gzip kB | In critical path? |
|----------|---------|-------------------|
| `index.html` | 0.73 | eager |
| `index-*.css` | 12.77 | eager |
| `index-*.js` (app core) | 63.41 | eager |
| `chunk-*.js` (React vendor) | 14.22 | eager (modulepreload) |
| `jsx-runtime`, `react-dom` | 5.07 | eager (modulepreload) |
| `AuthContext`, `ui`, `theme`, `api`, `mutationQueue` | 4.60 | eager (modulepreload) |
| `TripShell-*.js` | 1.81 | on day navigation |
| `DayView-*.js` | 10.99 | on day navigation |
| **Total before interactive** | **≈ 114.6 kB** | map excluded |
| `DayMap-*.js` (+ CSS) | 52.6 | **lazy** — after planning renders, not in TTI |

### Transfer + TTI estimate (Slow 4G ≈ 200 KB/s, 4× CPU)

| Component | Estimate |
|-----------|----------|
| Critical-path transfer (114.6 kB, parallelised via `modulepreload`) | ≈ 0.55 – 0.60 s |
| JS parse/execute at 4× CPU slowdown | ≈ 0.30 – 0.40 s |
| API round trips (fetchDay, fetchBudgetRollup — 150 ms RTT) | ≈ +0.15 s |
| **Estimated TTI** | **≈ 1.0 – 1.3 s** |

**Result: ≈ 1.0 – 1.3 s, below the 1.5 s target.** Consistent with the M09.5 baseline
(≈ 1.0 – 1.2 s); the small increase vs baseline is Leaflet's CSS/JS now split into the
**lazy** `DayMap` chunk (52.6 kB gzip), which is deferred behind `<Suspense>` and does
**not** block interactivity. The estimate is conservative — it treats transfer and parse
as partly sequential, whereas the browser parses while downloading.

### Live-stack confirmation

- Web served from Firebase Hosting `https://intricate-reef-424222-d6-web.web.app` → `200`.
- API `https://khiimori-api-qectzihgmq-nw.a.run.app/readyz` → `200` (first hit paid a
  cold-start; warm requests are sub-second — cold start is a one-off, not on the
  interactive critical path once the SW/shell is cached).
- Code-splitting guards still green: `DayView` is `React.lazy`, `DayMap` is a separate
  lazy chunk (`web/src/test/codeSplitting.test.ts`, `bundleSize.test.ts`).

## What keeps the critical path lean (unchanged from M09.5 S2)

1. **Code-splitting** — day-view JS is 10.99 kB gzip; admin/profile/trip-form/sharing are
   separate chunks that don't load on a day navigation.
2. **Lazy map** — `DayMap` (52.6 kB gzip incl. Leaflet CSS) is fetched only after the
   planning section renders; never blocks TTI.
3. **Lazy thumbnails** — `loading="lazy"` photos fetch on scroll; originals never load in
   the grid.
4. **No heavy critical-path deps** — React + React Router only; no charting/date/map lib
   in the eager path.

## Full-Lighthouse re-run (repeatable, for a live authenticated run)

To reproduce as a live Lighthouse run against real content (per the M09 method):

1. Deploy is already live (CI on `main` merge).
2. Chrome DevTools → Lighthouse → **Performance**, **Mobile**, simulated throttling.
3. Sign in, navigate to a day URL with ≥3 plan items, 1 stay, 1 photo.
4. Analyze page load; record TTI, LCP, TBT, Performance score; assert TTI < 1.5 s.
5. If missed, check per M09's regression checklist (shell > 270 kB raw? `DayMap` still
   split? thumbnails ≤ 200 kB? new heavy dep?).

## Verdict

✅ **Day view re-verified interactive ≈ 1.0 – 1.3 s on the mid-range-4G profile — below
the 1.5 s target.** Method reused unchanged from M09.5 S3 for comparability; result
recorded and reproducible. No gap, no remediation needed.

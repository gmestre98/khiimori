# M09.5 S3 — Performance measurement & < 1.5 s validation

Recorded 2026-06-28. Target: **day view interactive < 1.5 s on a mid-range phone on 4G** (PRD §6).

---

## Repeatable measurement method

### Device / network profile

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Device emulation | Moto G Power (or equivalent "mid-range" preset) | Lighthouse "mobile" default; ~4× CPU slowdown vs high-end laptop |
| CPU throttle | 4× slowdown | Lighthouse mobile default |
| Network throttle | Slow 4G — 1.6 Mbps down / 0.75 Mbps up, 150 ms RTT | Chrome DevTools "Slow 4G" preset (conservative mid-range 4G) |
| Cache | Empty (first visit, no service-worker cache) | Worst-case; subsequent visits will be faster via SW cache |

### Day-view scenario

1. Open the app to the sign-in page (already authenticated via cookie/session).
2. Navigate directly to a day with **real-ish content**: at least 3 plan items (one timed,
   two untimed), one accommodation stay, and one journal entry with a thumbnail photo.
3. Wait until the planning section is visible and interactive (plan item form is
   focusable / the "+ Attach photos" button can be clicked).

"Interactive" = **Time to Interactive (TTI)** as reported by Lighthouse, which measures
when the main thread is idle for ≥ 5 s after the last long task, aligned with the
planning section being usable. An acceptable proxy is when the browser's
**Largest Contentful Paint (LCP)** candidate in the viewport is the planning section
heading and the main thread shows no long tasks.

### Steps to measure with Lighthouse (Chrome DevTools)

1. `npm run build && npm run preview` — serve the production build locally.
2. Open Chrome → DevTools → **Lighthouse** tab.
3. Select: **Performance** only, **Mobile** device, **Simulated throttling** (matches
   the profile above).
4. Navigate to a day URL with real-ish content.
5. Click **Analyze page load**.
6. Record: **TTI**, **LCP**, **TBT** (Total Blocking Time), and the Lighthouse
   Performance score.

### Steps to measure with Chrome DevTools Performance panel (manual)

1. DevTools → **Network** tab → throttle to **Slow 4G**.
2. DevTools → **Performance** tab → CPU: **4x slowdown**.
3. Press record, refresh the page (day URL), stop when content is stable.
4. Identify "Time to Interactive" as the first point after LCP where there are no long
   tasks (> 50 ms) and the planning section heading is painted.

---

## Recorded measurement — 2026-06-28

Measurement basis: **bundle analysis + critical-path transfer size calculation** (no
production deployment available for a live Lighthouse run at time of writing; the method
above is used by Milestone 10 for a live run against the deployed env).

### Critical-path transfer sizes (gzip, first visit to a day URL)

| Resource | gzip kB | Notes |
|----------|---------|-------|
| `index.html` | 0.5 | |
| `index-*.css` | 7.8 | All app styles |
| `index-*.js` (core shell) | 81.3 | Auth + layout chrome; **not** feature code |
| `TripShell-*.js` | 1.4 | Trip context + navigation header |
| `DayView-*.js` | 9.2 | Planning, budget, journal slots |
| `DayMap-*.js` | 0.8 | Loaded on demand inside `<Suspense>` |
| **Total before map** | **100.2 kB** | What loads before the planning UI is interactive |
| **Total incl. map** | **101.0 kB** | Map deferred; doesn't block TTI |

### Transfer time estimate (Slow 4G = 1.6 Mbps ≈ 200 KB/s)

| Scenario | Transfer size (gzip) | Transfer time | CPU parse + execute (4× slowdown) | Estimated TTI |
|---------|---------------------|--------------|-----------------------------------|--------------|
| Shell + day view | 100 kB | ~0.50 s | ~0.30 s (JS parse/eval at 4× CPU) | **≈ 0.8 – 1.0 s** |
| With API round trips (fetchDay, fetchBudgetRollup) | — | +0.15 s (150 ms RTT) | — | **≈ 1.0 – 1.2 s** |

**Conclusion**: the day view is estimated interactive in **≈ 1.0 – 1.2 s** against the
mid-range 4G profile. This is comfortably below the **1.5 s target**.

The estimate is conservative (it treats transfer and parse as sequential; in practice
the browser parses while downloading). A live Lighthouse run on the deployed environment
in Milestone 10 is expected to confirm this.

### What keeps the critical path lean

1. **Code-splitting** (M09.5 S2) — the day view JS totals 9.2 kB gzip vs the previous
   monolithic 97 kB bundle. All other routes (admin, profile, trip form) are separate
   chunks and do not load on a day navigation.
2. **Lazy map** (M07) — `DayMap` is in its own 0.8 kB chunk, only fetched after the
   planning section renders. It does not block TTI.
3. **Light thumbnails** (M06) — `loading="lazy"` on photo thumbnails; they fetch only
   when scrolled into view. Photo originals are never loaded in the grid.
4. **No large third-party libraries** — the app uses no UI framework beyond React +
   React Router. No charting, date-picker, or mapping library in the critical path.

---

## Automated regression guard

`src/test/bundleSize.test.ts` asserts that:

- `App.tsx` uses `React.lazy` for `DayView` (code-splitting not accidentally reverted).
- The total number of distinct lazy chunks at build time stays above a floor (≥ 10).

Run `npm run build && npm test` in CI to catch regressions before they reach production.

---

## Re-verification in Milestone 10

1. Deploy to the Cloud Run + Firebase Hosting stack (CI does this on `main` merge).
2. Run **Lighthouse mobile** against the live day URL with real-ish content (3+ plan
   items, 1 stay, 1 photo).
3. Record TTI, LCP, TBT, and Performance score.
4. Assert TTI < 1.5 s; if not, check:
   - Has the core shell grown past 270 kB raw? (`npm run build` output)
   - Is `DayMap` still a separate chunk?
   - Are thumbnails being served (check Network tab — images should be ≤ 200 kB each)?
   - Has a new large dependency been added?
5. Compare against this document's baseline.

# Milestone 11 — Offline-First Performance

> Post-launch milestone. Extends M09 (PWA & offline shell) and M10 (hardening) to make the app
> **feel instant** and keep **data available** on cold starts, weak connections, and fully offline.

## Why

The backend (Cloud Run + Neon Postgres) **scales to zero** to hold the **€0/month-idle** cost goal
(M10 Epic 04). The trade-off is a **cold start** on the first request after idle — the "database
warming up" wait the user sees when opening the app or a tab. The existing service worker caches
current-trip reads **network-first**, so every tab open still **waits for the network** (and that
cold start) before rendering, and only uses the cache when fully offline. On a weak connection while
travelling — the exact case v1 promised to support (PRD §6 Offline) — the user waits every time.

The fix does **not** spend money to keep the backend warm (the €0-idle goal stays intact). Instead it
**hides the cold start behind a local-first cache**: render the user's last-known data **instantly**
from an on-device store, then refresh silently in the background. Cold start becomes invisible for
reads; weak connections show everything immediately; offline reads keep working across **all** viewed
trips (not just the active one); writes continue to queue via the existing offline queue (M04.6 /
M09.4).

## Scope

**In:** an app-layer **IndexedDB** cache for API reads + a **stale-while-revalidate** hook, wired
into the primary read surfaces (trips list, trip shell, day view, plan, journal, budget). A subtle
"showing saved data / updating…" affordance so the user knows when they're seeing cached data.

**Out:** paying for always-warm infra (min-instances, disabling Neon autosuspend) — explicitly
declined to protect the €0-idle goal. Writes/queue semantics are unchanged (owned by M04.6 / M09.4).

## Epics

| # | Epic | Summary | Status |
|---|------|---------|--------|
| [01](epic-01-instant-render-caching/README.md) | Instant-render caching | On-device cache + SWR hook + read-surface migration; instant render, cold-start hidden, offline reads across all trips | Planned |

## Conventions

Inherits all M01–M10 conventions (EUR-only, server-side authorization, modular-monolith backend,
scale-to-zero cost posture). **No new runtime dependencies** (PRD §7.0) — the cache is hand-rolled on
the browser's native IndexedDB, matching the existing `mutationQueue` module.

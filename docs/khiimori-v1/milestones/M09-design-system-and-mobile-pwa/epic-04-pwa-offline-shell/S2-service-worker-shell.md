# S2 — Service worker & app-shell caching

## Context
The PWA is **offline-capable**: the **app shell works offline** via service-worker caching (PRD §6
Offline). This story adds the service worker and shell caching.

## Task
Add a service worker that caches the app shell for offline use.

## Acceptance criteria
- [ ] A **service worker** is registered and caches the **app shell** (HTML/JS/CSS/icons) so the app
  loads offline.
- [ ] The shell loads when offline (verified by going offline and reloading).
- [ ] The caching strategy is defined (e.g. precache shell, runtime-cache as appropriate) and documented.
- [ ] The service worker is scoped correctly and doesn't break online updates (update handling in S5).

## Constraints
- Confirm any service-worker tooling/library with the author before adding it (project rule); a minimal
  hand-rolled or well-justified tool is fine (PRD §7.0).
- The service worker also coordinates the offline write queue (S4) — structure it for that.

## Definition of done
The app shell loads offline via a registered service worker.

## Dependencies
S1 (manifest/installability). Offline data viewing in S3; write-queue coordination in S4.

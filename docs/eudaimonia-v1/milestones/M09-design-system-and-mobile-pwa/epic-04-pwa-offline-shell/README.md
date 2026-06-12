# Epic M09.4 — PWA installability & offline shell

> Milestone: [09 — Design System & Mobile/PWA](../README.md) · PRD refs: §6 (Offline), §7.0, §7.2.

## Description

Make the app an **installable PWA** (web app manifest, service worker, icons) that launches
standalone on a phone, and **offline-capable**: the app shell and current-trip viewing work offline.
The service worker's caching and the **offline write queue** are **co-owned with Milestones 04 and
06** so there is **one** offline mechanism, not three. This epic provides the service-worker
coordination that Planning and Journal plug their queued writes into.

**Estimated effort:** ~2–3 developer-days (one developer).

## Acceptance Criteria

- [ ] The app is an **installable PWA** (manifest, service worker, icons) and **launches standalone**
      on a phone (PRD §7.2).
- [ ] The PWA is **offline-capable**: the **app shell and current-trip viewing work offline** via
      service-worker caching (PRD §6 Offline).
- [ ] The service worker **coordinates the offline write queue** used by Milestones 04 (Planning) and
      06 (Journal) — **one** mechanism, not three (PRD §6, §7.0).
- [ ] Cached content updates correctly when back online (no stale-forever shell); update/version
      handling is defined (PRD §6).
- [ ] Offline behaviour is tested (install, offline shell load, queued write replay on reconnect)
      (PRD §7.6).

## Implementation Details / Architecture

- Part of the **`/web` React + TypeScript** app (PRD §7.2). The **service worker owns caching +
  offline coordination**; the **write-queue semantics** are owned by Milestone 04 (and reused by
  Milestone 06) — this epic integrates them into the PWA shell, it does not redefine the queue
  (PRD §6, §7.0).
- Co-design checkpoint with Milestones 04/06: the service worker registers/serves the queue and
  triggers replay on reconnect using their agreed queue record format.
- Manifest + icons follow the minimal black/white identity (Epic 01).

## Dependencies

- **Upstream:** Milestone 01 (web app shell, hosting/CDN), Epics 01–03 (themed shell to cache).
- **Shared:** Milestone 04 (offline write queue) and Milestone 06 (Journal offline) plug into this
  service worker.
- **Downstream:** Milestone 10 verifies offline → online sync end-to-end.

## Costs Impact

No direct infra cost; **indirectly cost-positive** — a cached shell and offline viewing reduce
repeat network/API calls. Hosting stays within the **Firebase Hosting free tier** (PRD §8.1).

## Designs

Standalone mobile/PWA experience:
[assets/03-mobile-and-sharing.svg](../../../assets/03-mobile-and-sharing.svg) (PRD §4.3).

# Epic M09.4 — PWA installability & offline shell

> **Status:** ✅ Done — all 5 stories shipped across PRs [#376](https://github.com/gmestre98/khiimori/pull/376) (S1), [#377](https://github.com/gmestre98/khiimori/pull/377) (S2), [#378](https://github.com/gmestre98/khiimori/pull/378) (S3), [#379](https://github.com/gmestre98/khiimori/pull/379) (S4), [#380](https://github.com/gmestre98/khiimori/pull/380) (S5). 5/5 ACs satisfied, 377 tests green.

> Milestone: [09 — Design System & Mobile/PWA](../README.md) · PRD refs: §6 (Offline), §7.0, §7.2.

## Description

Make the app an **installable PWA** (web app manifest, service worker, icons) that launches
standalone on a phone, and **offline-capable**: the app shell and current-trip viewing work offline.
The service worker's caching and the **offline write queue** are **co-owned with Milestones 04 and
06** so there is **one** offline mechanism, not three. This epic provides the service-worker
coordination that Planning and Journal plug their queued writes into.

**Estimated effort:** ~2–3 developer-days (one developer).

## Acceptance Criteria

- [x] The app is an **installable PWA** (manifest, service worker, icons) and **launches standalone**
      on a phone (PRD §7.2). — S1 + S2
- [x] The PWA is **offline-capable**: the **app shell and current-trip viewing work offline** via
      service-worker caching (PRD §6 Offline). — S2 + S3
- [x] The service worker **coordinates the offline write queue** used by Milestones 04 (Planning) and
      06 (Journal) — **one** mechanism, not three (PRD §6, §7.0). — S4
- [x] Cached content updates correctly when back online (no stale-forever shell); update/version
      handling is defined (PRD §6). — S5
- [x] Offline behaviour is tested (install, offline shell load, queued write replay on reconnect)
      (PRD §7.6). — S5 (offlineIntegration.test.ts, 15 tests)

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

## User stories

The epic is split into **5 small user stories**, each sized **≤4h for one developer** (implementation +
tests + review). Each story file is a standalone agent-ready prompt with enough context to implement it
without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-manifest-installability.md) | Web app manifest, icons & installability | ~3h | AC1 | M01.6, Epic 01 |
| [S2](S2-service-worker-shell.md) | Service worker & app-shell caching | ~3.5h | AC2 | S1 |
| [S3](S3-offline-current-trip.md) | Offline current-trip viewing | ~3h | AC2 | S2, M03–M06 |
| [S4](S4-write-queue-coordination.md) | Service worker coordinates the offline write queue | ~3h | AC3 | S2, M04 Epic 06, M06 Epic 04 |
| [S5](S5-update-handling-tests.md) | Update/version handling & offline tests | ~3h | AC4, AC5 | S1–S4 |

**Total:** ~15.5h (≈ 2–3 dev-days), consistent with the epic's ~2–3 dev-day estimate.

### Sequencing

```
S1 Manifest & installability ── S2 Service worker & shell ──┬─ S3 Offline current-trip
                                                            ├─ S4 Write-queue coordination
                                                            └─ S5 Update handling & tests
```

> S4 **integrates** Milestone 04's offline write queue (one mechanism, reused by M06) — it does not
> redefine it. S2 flags confirming any service-worker tooling with the author.

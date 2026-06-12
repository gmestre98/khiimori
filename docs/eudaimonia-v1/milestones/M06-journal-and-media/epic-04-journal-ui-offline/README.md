# Epic M06.4 — Journal UI & offline (frontend)

> Milestone: [06 — Journal & Media](../README.md) · PRD refs: §5.5, §6, §5.10, §7.2.

## Description

Build the **journal experience** in the web app: per-day entry editing (body, rating, weather,
mood), **photo attach** with captions, **per-trip usage display with a warning** as the 1 GB cap
nears, and **past-trip journals as a permanent, read-accessible record**. Journaling **auto-saves**
and is **offline-capable** on mobile, reusing Milestone 04's shared queue/replay so text entries and
photo intents created offline sync when connectivity returns.

**Estimated effort:** ~2–3 developer-days (one developer).

## Acceptance Criteria

- [ ] A per-day **journal editor** edits body, rating, weather, and mood with **auto-save** (no
      explicit save), and **attaches photos** with optional captions (PRD §5.5).
- [ ] The UI **shows per-trip photo usage and warns as the 1 GB cap approaches**, and surfaces the
      server-side **rejection message** clearly when the cap is hit (PRD §5.5, Epic 03).
- [ ] Journal text and **photo intents created/edited offline queue and sync** when back online,
      reusing the **shared offline mechanism from Milestone 04** (PRD §6).
- [ ] **Past-trip journals remain accessible** as a permanent record (PRD §5.5).
- [ ] Surfaces are mobile-first and responsive (photos as the visual content), using Milestone 09
      components when available (PRD §5.10, §7.2).

## Implementation Details / Architecture

- Part of the **`/web` React + TypeScript** app (PRD §7.2), rendered within Milestone 03's trip/day
  shell.
- **Offline strategy (shared with Milestone 04):** text entries queue as idempotent writes; **photo
  uploads queue as deferred binary uploads** that replay when online — one mechanism, used by both
  (PRD §7.0, §6).
- The UI reads server-enforced state (usage, cap rejections) rather than re-implementing the cap
  client-side; the server remains the guardrail (PRD §8.4).

## Dependencies

- **Upstream:** Epics 01–03 (entries, photos, quota/usage/thumbnails APIs), Milestone 04 (offline
  queue), Milestone 03 (trip/day shell).
- **Shared:** Milestone 09 (service worker / PWA shell) coordinates the offline cache.
- **Downstream:** Milestone 10 exercises the journal + offline-sync journeys.

## Costs Impact

Negligible direct cost — static assets on Firebase Hosting free tier; serving **thumbnails** (Epic
03) keeps photo egress low (PRD §8.1, §8.4 #3).

## Designs

Mobile journal view: [assets/03-mobile-and-sharing.svg](../../../assets/03-mobile-and-sharing.svg)
(PRD §4.3, §5.10).

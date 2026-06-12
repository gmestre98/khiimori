# Epic M04.5 — Day view & inline editing (frontend)

> Milestone: [04 — Organic Day Planning](../README.md) · PRD refs: §5.2, §5.3, §5.10, §7.2.

## Description

Build the **day view** in the web app: stays, timed items in chronological order, untimed items as a
loose list, and the ideas backlog — with **inline add/edit in a couple of taps** and **auto-save**.
Adding a spontaneous activity must be as easy as journaling. The view exposes the drag-reorder /
move-to-day / status affordances backed by Epic 04 and the promote/demote actions from Epic 03,
optimised for thumb-reachable mobile interaction.

**Estimated effort:** ~2–3 developer-days (one developer).

## Acceptance Criteria

- [ ] The day view shows **timed items in chronological order** and **untimed items as a loose
      list**, plus the day's **stay(s)** and access to the **ideas backlog** — never forcing a time
      where there isn't one (PRD §5.2).
- [ ] **Inline add/edit** of a plan item is a couple of taps (title-only quick add, expand for
      optional fields) — as easy as journaling (PRD §5.3).
- [ ] **Drag-reorder**, **move-to-day**, **promote/demote**, and **status** (done/skipped/cancelled)
      affordances are wired to Epics 03–04 (PRD §5.3).
- [ ] All changes **auto-save** with no explicit "save" button; in-flight saves are debounced and
      surfaced subtly (PRD §5.3).
- [ ] The view is **mobile-first** (thumb-reachable actions, sheets for quick add/edit) and
      responsive on laptop, using basic styling now and Milestone 09 components when available
      (PRD §5.10, §7.2).

## Implementation Details / Architecture

- Part of the **`/web` React + TypeScript** app (PRD §7.2), rendered inside Milestone 03's trip/day
  shell.
- Auto-save is **debounced on the client**; writes go through the same mutation layer Epic 06 wraps
  for offline so the UI behaves identically online and offline.
- Mobile interactions (large tap targets, sheets, drag) directly enable the "spontaneous changes are
  fast on mobile" requirement (PRD §5.3, §5.10) and adopt Milestone 09 primitives as they land.

## Dependencies

- **Upstream:** Milestone 03 (trip/day shell), Epics 01–04 (stays, plan items, backlog, re-planning
  APIs).
- **Downstream:** Epic 06 (offline wraps these writes); Milestone 05 adds the budget panel/fast-cost
  affordance to this view; Milestone 07 adds the map.

## Costs Impact

Negligible — static assets served from Firebase Hosting free tier (PRD §8.1).

## Designs

Day plan with itinerary/accommodation/activities:
[assets/02-day-plan-map.svg](../../../assets/02-day-plan-map.svg) (PRD §4.2); mobile day view:
[assets/03-mobile-and-sharing.svg](../../../assets/03-mobile-and-sharing.svg) (PRD §4.3).

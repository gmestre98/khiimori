# Milestone 04 — Organic Day Planning

> The spontaneity-first planning core: stays, plan items (timed & untimed), the ideas backlog,
> inline editing with auto-save, drag-reorder / move-to-day, item statuses, and offline-capable
> writes. Plans are loose by default and precise when wanted.
>
> PRD refs: §5.2, §5.3, §9 (Stay, PlanItem), §7.1 (Trip/Itinerary module).

---

## Milestone goal

Let a traveller plan a trip **organically**. For each day they manage **accommodation/stays**, a
flexible list of **plan items** (activities, tours, ideas, transport) that are **untimed** or
**timed**, and a **per-trip/per-day ideas backlog**. Re-planning is **first-class**: reorder within
a day, move items between days, promote ideas into a day (and back), and mark items **done /
skipped / cancelled** so the day becomes a record of what actually happened. Capturing an idea is
one tap; everything **auto-saves** and is **offline-capable** so re-planning works mid-trip with
poor connectivity. Costs on stays/plan items are owned here and become the source for Milestone 05's
budget roll-ups.

## Milestone-level Definition of Done

- **Stays** can be added/edited/removed (name, location, check-in/out, link, cost) and a **multi-night
  stay spans multiple days without re-entry** (PRD §5.2).
- **Plan items** need only a title; type/time/duration/location/booking/link/cost are optional; an
  item is **untimed** (null `start_time`) or **timed**, and the day view shows **timed items
  chronologically and untimed items as a loose list** (PRD §5.2).
- An **ideas backlog** (`day_id = null`) exists; ideas **promote to a day and demote back without
  re-entry**; items can be **reordered**, **moved between days**, and marked **done/skipped/
  cancelled** (PRD §5.2, §5.3, §9).
- **Inline add/edit** is a couple of taps and all changes **auto-save**; planning **works offline**
  on mobile via a shared queue that replays when back online (PRD §5.3, §6).
- Unit + integration tests cover promote/demote, move-between-days, reorder, status transitions, and
  multi-day stay rendering (PRD §7.6).

## Epics in this milestone

| Epic | Title | AC | Est. (dev-days) | Cost-relevant |
|------|-------|----|-----------------|---------------|
| [01](epic-01-stays/README.md) | Stays (accommodation, multi-night spanning) | 4 | ~1–2 | — |
| [02](epic-02-plan-items/README.md) | Plan items model & CRUD (timed & untimed) | 5 | ~2 | — |
| [03](epic-03-ideas-backlog/README.md) | Ideas backlog & promote/demote | 4 | ~1–2 | — |
| [04](epic-04-replanning-reorder-move/README.md) | Re-planning: reorder, move-between-days, statuses | 4 | ~2 | — |
| [05](epic-05-day-view-inline-edit/README.md) | Day view & inline editing (frontend) | 5 | ~2–3 | — |
| [06](epic-06-offline-writes/README.md) | Offline-capable writes (shared queue/replay) | 4 | ~2–3 | — |
| | **Milestone total** | **26** | **~10–14** (≈ 2.5–3 weeks, one developer) | — |

> **Estimates** assume one developer familiar with the stack; they cover implementation, tests, and
> review. Epic 06's offline mechanism is **co-designed with Milestone 06 (Journal)** so both reuse a
> single queue/replay approach.

## Sequencing within the milestone

```
01 Stays ───────────────┐
02 Plan items ─┬─ 03 Ideas backlog & promote/demote ─┐
               └─ 04 Re-planning: reorder/move/status ─┤
                                                       ├─ 05 Day view & inline editing
                                                       └─ 06 Offline-capable writes
```

Stays and plan items are the data foundation; backlog and re-planning build on plan items; the day
view consumes all of them; offline wraps the mutations once their shape is settled.

## Designs

- Day plan with itinerary, accommodation, activities:
  [assets/02-day-plan-map.svg](../../assets/02-day-plan-map.svg) (PRD §4.2).
- Mobile day view and quick re-planning:
  [assets/03-mobile-and-sharing.svg](../../assets/03-mobile-and-sharing.svg) (PRD §4.3).

# Milestone 04 — Organic Day Planning

**Status:** Milestone overview — to be split into focused epics (≤5 acceptance criteria each) following the [Milestone 01](../M01-foundations/README.md) pattern. The criteria below are the milestone-level spec and the source material for that split.

> Stays, plan items (timed & untimed), the ideas backlog, inline editing, drag-reorder /
> move-to-day, and item statuses — the spontaneity-first planning core.
>
> PRD refs: §5.2, §5.3, §9 (Stay, PlanItem), §7.1 (Trip/Itinerary module).

---

## Description

The heart of the product: planning a trip **organically**. Plans are **loose by default and
precise when wanted** — capturing an idea must be one tap, while a booked tour can carry a time
and a confirmation. For each day a traveller manages **accommodation/stays**, a flexible list of
**plan items** (activities, tours, ideas, transport) that are either **untimed** or **timed**, and
a **per-trip/per-day ideas backlog**. Re-planning is **first-class**: reorder within a day, move
items between days, promote ideas into a day (and back), and mark items **done / skipped /
cancelled** so the day becomes a record of what actually happened. Everything **auto-saves** and
is **offline-capable** so re-planning works mid-trip with poor connectivity.

## Acceptance Criteria

**Stays (PRD §5.2):**
- [ ] Add/edit/remove an **accommodation** with name, location, check-in/out, link, cost.
- [ ] A **multi-night stay spans multiple days without re-entry** — entered once, shown across the
      nights it covers.

**Plan items — untimed & timed (PRD §5.2):**
- [ ] Create a plan item with **only a title** required; type, time, duration, location, booking
      status, link, and cost all optional.
- [ ] An item is **untimed** when `start_time` is null (a loose idea/maybe) or **timed** when a
      start time (and optional duration) is set.
- [ ] The **day view** shows **timed items in chronological order** and **untimed items as a loose
      list**, never forcing a time where there isn't one (PRD §5.2).

**Ideas backlog (PRD §5.2, §5.3):**
- [ ] A **parking lot** of unscheduled ideas exists at trip (and/or day) level — represented as a
      `PlanItem` with `day_id = null` (PRD §9).
- [ ] **Promote an idea to a day** by setting its `day_id` (and optionally `start_time`) and demote
      back to the backlog — **without re-entering** the item (PRD §5.3).

**Re-planning & spontaneity (PRD §5.3):**
- [ ] **Reorder** items within a day (drag or equivalent) updating their `order`.
- [ ] **Move an item to another day** via drag or a "move to day" action (changes `day_id`).
- [ ] **Mark items `done`, `skipped`, or `cancelled`** (status set: `idea | planned | done |
      skipped | cancelled`) so the day reflects reality (PRD §9).
- [ ] **Inline add/edit** in a couple of taps — adding a spontaneous activity is as easy as
      journaling (PRD §5.3).
- [ ] All changes **auto-save**; no explicit "save" button needed.
- [ ] Planning **works offline on mobile** for the current trip — writes queue and sync when back
      online, consistent with Epic 06's offline strategy (PRD §5.3, §6).

**Quality:**
- [ ] Unit + integration tests for promote/demote, move-between-days, reorder, status
      transitions, and multi-day stay rendering (PRD §7.6).

## Implementation Details / Architecture

- Lives in the **`trip` module** (PRD §7.1) alongside Epic 03, `trip.*` schema (PRD §7.7).
- Entities (PRD §9):
  - `Stay(id, trip_id, name, location, check_in, check_out, cost, link)` — spans days via its
    check-in/out range rather than per-day duplication.
  - `PlanItem(id, trip_id, day_id?, title, type, start_time?, duration?, location?,
    booking_status?, cost?, link?, order, status)`.
- **Semantics (PRD §9 notes):** `day_id = null` → backlog idea; `start_time = null` → untimed.
  Promote = set `day_id`; move = change `day_id`; both reuse the same row (no re-entry).
- `order` gives stable within-day sequence for the loose/timed mix; `status` drives the
  done/skipped/cancelled rendering.
- **Costs on `Stay`/`PlanItem` are the source for automatic budget roll-ups** consumed by Epic 05
  — this epic owns the cost fields; Epic 05 owns aggregation (clean module boundary, PRD §7.1).
- **Offline-first writes:** mutations are designed to be **queueable and idempotent** (stable
  client-generated ids or upsert semantics) so the offline sync layer (shared with Epic 06) can
  replay them; auto-save debounced on the client (PRD §6).
- **Mobile interactions** prioritise thumb-reachable, low-friction add/edit and drag gestures
  (PRD §5.3, §5.10) — delivered with Epic 09 components.

## Dependencies

- **Upstream:** Epic 03 (trips & days), Epic 02 (user), Epic 01 (DB/service).
- **Shared:** the **offline sync mechanism** is co-designed with Epic 06 (Journal) so both reuse
  one queue/replay approach rather than two (PRD §6, §7.0 "fewest moving parts").
- **Downstream:** Epic 05 (Budgets) reads stay/plan-item costs; Epic 07 (Maps) reads item/stay
  locations to place pins.

## Costs Impact

Negligible incremental cost — plan/stay data are small relational rows in the existing Neon DB
(PRD §8, free tier). The notable cost-relevant choice is **offline write queueing**, which adds
client complexity but no infra spend.

## Designs

- Day plan with itinerary, accommodation, activities, daily budget, and map:
  [assets/02-day-plan-map.svg](../assets/02-day-plan-map.svg) (PRD §4.2).
- Mobile day view and quick re-planning:
  [assets/03-mobile-and-sharing.svg](../assets/03-mobile-and-sharing.svg) (PRD §4.3).

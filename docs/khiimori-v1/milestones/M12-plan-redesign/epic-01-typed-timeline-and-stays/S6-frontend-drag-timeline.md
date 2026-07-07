# S6 — Frontend: unified drag timeline

> Epic: [M12.1 Typed timeline & single stays](README.md) · AC6 · depends on S5.

## Goal

Replace the two separate "Schedule" (timed) and "Activities" (untimed) sections
with **one time-ordered timeline**: timed items read in clock order, and untimed
items can be dragged anywhere — including between two timed items — with the spot
remembered.

## Scope

- **Backend** (`plan_item_store.go`):
  - `ListByDay` now orders by `sort_order` first (the single source of the
    timeline order, so an untimed item persists between two timed ones), with a
    timed-first-chronological fallback for items that still share a sort_order.
  - `CreatePlanItem` appends (`sort_order = MAX+1` per day/backlog) so a new item
    lands at the end rather than colliding at 0 once a day has been arranged.
- **Frontend** (`DayView.tsx`):
  - `orderTimeline(items)` keeps timed items in clock order while untimed items
    hold their dropped position — so "set a time → it slots into place" works from
    render alone, and a drag decides an untimed item's spot.
  - `TimelineSection` renders the whole day as one list. Only untimed rows are
    draggable (drag handle / touch up-down); **every** row is a drop target, so an
    untimed item can be dropped between two timed ones. A drop persists the full
    order via the reorder API (optimistic, reverts on failure).
  - `PlanItemRow` decouples drop-target from draggable so timed rows can receive a
    drop without being picked up.

## Acceptance

- [x] Timed and untimed items render in **one** drag-ordered timeline (no more
      split Schedule / Activities sections).
- [x] Timed items sort by clock; untimed items are draggable anywhere, including
      between timed items, and the position persists (ListByDay honours sort_order).
- [x] Unit test (timed sorted + untimed held between them), backend integration
      test (interleave persists across a re-fetch); full gate green; **verified
      in-browser** (one Timeline, timed pinned by time, untimed with drag handles).

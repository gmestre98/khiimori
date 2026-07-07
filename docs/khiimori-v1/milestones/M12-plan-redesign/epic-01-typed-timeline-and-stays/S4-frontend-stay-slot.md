# S4 — Frontend: pinned single-stay slot

> Epic: [M12.1 Typed timeline & single stays](README.md) · AC4 · depends on S3.

## Goal

Surface the stay as *where you sleep*: a single pinned slot on top of each day's
plan, editable inline, with per-night context — and, because the backend allows
one stay per night (S3), the UI **edits rather than adds** when the night is
already covered.

## Scope

- **API client** (`api.ts`): `StayInput`, `createStay`/`updateStay`/`deleteStay`,
  and typed errors `StayValidationError` (400) + `StayOverlapError` (409) so the
  UI can message a conflict distinctly.
- **Offline** (`mutationQueue.ts`, `replayQueue.ts`, `conflictResolution.ts`):
  new `createStay`/`updateStay`/`deleteStay` mutation kinds with replay handlers;
  `updateStay` deduplicates by `(trip, stay)` (last-write-wins) like plan-item
  edits.
- **`StaySlot` component** (`StaySlot.tsx`): shows the day's one covering stay
  with a per-night badge ("checking in" / "night N of M"), Edit + Remove, and the
  map-pin badge; an "Add where you're staying" affordance when the night is free.
  Inline add/edit form (name, location, check-in/out, cost, link) defaulting
  check-in to the day. Online → calls the API; offline → enqueues + reflects a
  temp stay. Overlap (409) shows an inline message.
- **Wiring**: `PlanningSection` gains a `setStays` prop; `DayView` and
  `TripPlanPage` provide it (mapping into their day state) so the slot and the day
  map stay in sync without a reload.
- **Dev mock fix**: the mock stays used a time (`11:00`) for `check_out`; corrected
  to real dates so night context renders in dev.

## Acceptance

- [x] A single stay is pinned above the timeline on every day, editable inline.
- [x] Per-night context ("checking in" / "night N of M") and an add affordance
      when the night is free.
- [x] Add / edit / remove work online and enqueue offline; a 409 overlap surfaces
      a clear message.
- [x] Component + replay-dispatch tests; full web gate (build/lint/tests/format)
      green; **verified in-browser** (pinned slot, night badges, edit form).

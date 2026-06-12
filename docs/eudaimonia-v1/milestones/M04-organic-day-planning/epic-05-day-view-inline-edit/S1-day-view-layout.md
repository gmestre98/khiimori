# S1 — Day view layout (timed / untimed / stays / backlog)

## Context
The **day view** shows timed items in chronological order, untimed items as a loose list, the day's
stay(s), and access to the ideas backlog — never forcing a time where there isn't one (PRD §5.2). Renders
inside Milestone 03's trip/day shell.

## Task
Build the day-view layout that renders the day's planning data.

## Acceptance criteria
- [ ] **Timed items** render in chronological order; **untimed items** render as a loose list; the two are
  clearly distinguished.
- [ ] The day's **stay(s)** (multi-night spanning from Epic 01) are shown on each covered day.
- [ ] The **ideas backlog** (Epic 03) is accessible from the day/trip view.
- [ ] Item `status` (done/skipped/cancelled) is reflected visually (Epic 04 S3).
- [ ] The view renders inside the M03 trip/day shell and is responsive (web + mobile).

## Constraints
- Pull data from Epics 01–04 APIs; render server-decided ordering (`order`/`start_time`).
- Basic styling now; Milestone 09 components later.

## Definition of done
The day view renders timed/untimed items, stays, and backlog access with status reflected, inside the trip
shell.

## Dependencies
M03 Epic 05 (trip/day shell), Epics 01–04 (stays, plan items, backlog, status). Add/edit in S2.

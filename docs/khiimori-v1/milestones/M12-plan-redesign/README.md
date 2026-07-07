# Milestone 12 — Plan redesign

> Milestone: 12 · PRD refs: §5.2 (Organic planning), §9 (Data model), §7.0.

The day planner treated every itinerary entry as one generic "plan item" whose
only differentiator was a `type` string that doubled as its **budget category**.
That conflated three separate ideas — what an item *is*, where it sits in the
day, and how it costs — and made stays (which are really *where you sleep*) look
like just another list row.

This milestone reworks the planner around how a traveller actually thinks about a
day:

- **Stays come first and there's one per night.** A stay is pinned above the
  timeline and enforced as a single accommodation per night (it may span nights).
- **Items have a first-class _kind_** — activity, transport, food, or note — that
  drives their icon, fields, and behaviour, **decoupled from budget category**.
  Transport in particular gets an origin→destination and an arrival time.
- **One time-ordered timeline.** Timed items sort by the clock; untimed items are
  dragged freely anywhere in the list, including between timed items.

| Epic | Title | Status |
|------|-------|--------|
| [01](epic-01-typed-timeline-and-stays/README.md) | Typed timeline & single stays | 🚧 In progress |

## Conventions

Inherits all milestone-wide conventions (EUR currency, server-side authorization,
modular monolith with schema-per-module, €0-idle cost posture). No new runtime
dependencies (PRD §7.0).

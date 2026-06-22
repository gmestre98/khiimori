# S2 — Generate days on trip create

## Context
On create, a trip **auto-generates exactly one `Day` per date** in `[start_date, end_date]`, each with an
`index` and real `date`, transactionally (PRD §5.1). This hooks into Epic 01's create path.

## Task
Implement day generation that runs within trip creation.

## Acceptance criteria
- [x] On trip create, exactly **one `Day` per date** in `[start_date, end_date]` is created, with a stable
  `index` (e.g. 1..N) and the real `date`.
- [x] Generation runs in the **same transaction** as trip create (Epic 01 S2) — trip + days commit
  together.
- [x] Generation is **idempotent** against the `(trip_id, date)` guard (re-running does not duplicate
  days).
- [x] A unit test covers a multi-day trip and a single-day trip (one day generated).

## Constraints
- Derive days purely from the date range; do not detach days from real calendar dates (PRD §5.1).
- Keep the generation a pure function over the range so S3 can reuse it for regeneration.

## Definition of done
Creating a trip generates one day per date atomically; single- and multi-day cases covered by tests.

## Dependencies
S1 (Day table), Epic 01 S2 (create transaction). Reused by S3.

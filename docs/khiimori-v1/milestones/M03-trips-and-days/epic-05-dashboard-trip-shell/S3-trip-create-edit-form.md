# S3 — Trip create/edit form

## Context
Users create and edit trips from a **form**: name, destinations, start/end date, cover, EUR shown as fixed
(PRD §5.1). Drives Epic 01's CRUD endpoints.

## Task
Build a trip create/edit form wired to the trip CRUD API.

## Acceptance criteria
- [ ] The form captures `name`, `destinations`, `start_date`, `end_date`, and `cover`, and shows
  `base_currency` as **EUR** (read-only).
- [ ] Submitting **creates** (Epic 01 S2) or **edits** (Epic 01 S3) a trip; validation (end ≥ start)
  is surfaced before/after submit.
- [ ] On a date-range change, the user is informed that days will be added/removed (and warned for
  shrink-with-data, per Epic 02 S3).
- [ ] The form is responsive (web + mobile); basic styling now, Milestone 09 later.

## Constraints
- EUR is non-editable in the UI and enforced server-side (Epic 01) — do not add a currency selector.
- Surface the shrink-with-data guard from Epic 02 S3 so users don't lose data unknowingly.

## Definition of done
Users can create and edit trips from a validated form; EUR is fixed; date-range effects are communicated.

## Dependencies
S1, Epic 01 (CRUD), Epic 02 S3 (range-edit guard). Archive/delete affordances in S4.

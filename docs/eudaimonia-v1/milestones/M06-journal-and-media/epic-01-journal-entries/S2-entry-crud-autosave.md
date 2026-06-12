# S2 — Entry CRUD & idempotent auto-save

## Context
An entry supports a free-text body plus optional rating, weather, mood, with `author_id` recording the
writer; text **auto-saves** with no explicit save, via an idempotent save path so Epic 04's offline queue
can replay it (PRD §5.5, §6).

## Task
Implement journal-entry create/update (upsert per day) with an idempotent save contract.

## Acceptance criteria
- [ ] An upsert endpoint creates/updates the day's single entry (body + optional rating/weather/mood),
  setting `author_id` from the session.
- [ ] The save path is **idempotent** (stable per-day entry / upsert) so offline replay is safe.
- [ ] Reading a day returns its entry (or none).
- [ ] A unit test covers create, update, one-per-day enforcement, and author capture.

## Constraints
- One entry per day (S1 guard); concurrent saves upsert rather than duplicate.
- No explicit save semantics — the API is a plain idempotent upsert; debouncing is client-side (Epic 04).

## Definition of done
Day journal entries can be created/updated idempotently with author tracking; tests green.

## Dependencies
S1, Milestone 02 (author). Authz in S3; UI/auto-save in Epic 04.

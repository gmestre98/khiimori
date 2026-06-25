# S1 — Per-trip photo usage tracking

## Context
The 1 GB-per-trip cap (Epic 03) needs an accurate **per-trip usage** figure (sum of stored photo bytes)
that the cap check (S2) and the warn UI (S4) rely on (PRD §5.5, §11.4).

## Task
Implement per-trip photo usage accounting.

## Acceptance criteria
- [x] Stored photo byte sizes are tracked per trip (e.g. a size column on `Photo` and/or a per-trip
  aggregate), updated on add.
- [x] A usage value per trip is computable/readable (total bytes used vs. the 1 GB cap).
- [x] Usage accounting accounts for **all variants** that count toward the cap (decide and document
  whether thumbnails count — originals always do).
- [x] A unit test covers usage incrementing on add.

## Constraints
- Accounting must be reliable enough to enforce a hard cap server-side (S2) — not an estimate that can
  drift.
- Keep it simple: a summed column or a cheap aggregate query (PRD §7.0).

## Definition of done
Per-trip photo usage is tracked accurately and readable for the cap check and UI.

## Dependencies
Epic 02 (Photo, MediaStore). Consumed by S2 (cap), S4 (warn UI), S5 (tests).

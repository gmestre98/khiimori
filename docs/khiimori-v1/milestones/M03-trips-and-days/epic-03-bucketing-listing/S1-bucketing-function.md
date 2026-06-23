# S1 — Bucketing function (Current/Upcoming/Past)

## Context
Trips are grouped automatically into **Current / Upcoming / Past** from `start_date`/`end_date` vs. today,
centralised server-side so web and mobile agree (PRD §5.1). This story implements the pure bucketing logic
and current-trip detection.

## Task
Implement a pure function that classifies a trip into Current/Upcoming/Past and flags the current trip,
given a reference "today".

## Acceptance criteria
- [x] A pure function maps a trip (`start_date`, `end_date`) and a server-supplied `today` to one of
  **Current / Upcoming / Past**.
- [x] **Current** = today within `[start_date, end_date]`; **Upcoming** = starts after today; **Past** =
  ends before today.
- [x] The function identifies the **current trip** (range spanning today) distinctly so the UI can surface
  it.
- [x] Boundary handling is explicit (a trip starting/ending exactly today is Current).

## Constraints
- Pure and timezone-consistent: `today` is supplied by the server, not derived per client (PRD §5.1).
- No DB access in the function — it operates on values so it is trivially testable (tests in S3).

## Definition of done
A documented pure bucketing function classifies trips and flags the current trip, with explicit boundary
rules.

## Dependencies
Epic 01 (Trip model). Consumed by S2 (listing) and Epic 05 (dashboard).

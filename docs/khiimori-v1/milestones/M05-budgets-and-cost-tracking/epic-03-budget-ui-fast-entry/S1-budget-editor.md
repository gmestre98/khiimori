# S1 — Budget editor (trip / day / category)

## Context
A **budget editor** sets `planned_amount` per **trip / per day / per category** (the five fixed
categories), driving Epic 01 (PRD §5.4). Renders in the trip/day shell (Milestone 03).

## Task
Build the budget editor UI wired to Epic 01's budget-line API.

## Acceptance criteria
- [ ] The editor sets/updates `planned_amount` for each fixed category at **trip level** and **per day**.
- [ ] Amounts are **EUR** only (no currency selector).
- [ ] Saving drives Epic 01 S2 (upsert) and reflects immediately.
- [ ] The editor is responsive (web + mobile); basic styling now, Milestone 09 later.

## Constraints
- Only the five fixed categories; no custom categories in v1.
- Render server-decided state; the budget math/actuals come from Epic 02 (this is the planned side).

## Definition of done
Users can set trip- and day-level category budgets in EUR from the editor; changes persist immediately.

## Dependencies
M03 Epic 05 (trip/day shell), Epic 01 (budget-line API). Fast cost entry in S2.

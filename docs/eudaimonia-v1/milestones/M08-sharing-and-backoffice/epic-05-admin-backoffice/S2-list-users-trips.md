# S2 — List users & list trips

## Context
The admin can **list users** and **list trips** (PRD §5.9). These are the read surfaces of the minimal
backoffice.

## Task
Implement admin endpoints and UI to list users and trips.

## Acceptance criteria
- [ ] An admin endpoint lists **users** (id, email, name, `is_admin`, active/disabled state) with basic
  paging/search if needed.
- [ ] An admin endpoint lists **trips** (id, name, owner, dates, status) across all users.
- [ ] Both are gated by `is_admin` (S1) server-side.
- [ ] The backoffice UI renders both lists; a unit test covers the gated reads.

## Constraints
- Keep it minimal (PRD §5.9) — lists, not analytics/dashboards.
- Reads cross user boundaries by design (admin scope) but remain gated server-side.

## Definition of done
An admin can list users and trips from the gated backoffice; tests green.

## Dependencies
S1 (gating), Milestone 02 (users), Milestone 03 (trips). Actions in S3.

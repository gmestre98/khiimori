# S4 — Archive & delete affordances

## Context
The UI exposes **archive** (hide without deleting) and **delete** (cascade) for a trip, matching Epic 01
S4. Delete is destructive, so it needs a clear confirmation (PRD §5.1).

## Task
Add archive and delete affordances with appropriate confirmation.

## Acceptance criteria
- [ ] An **archive** action moves a trip out of the active lists (calls Epic 01 S4) and the dashboard
  updates immediately.
- [ ] A **delete** action requires explicit confirmation (it cascades days/owned data) and removes the
  trip on confirm.
- [ ] Archived trips are visible in the **Past/archived** context (or an archived view), not the active
  buckets.
- [ ] Only a user authorized to manage the trip sees these controls (server still enforces — Epic 04).

## Constraints
- Confirmation copy makes the cascade/finality of delete clear.
- Control visibility reflects capability, but enforcement stays server-side (PRD §5.9).

## Definition of done
Users can archive and (with confirmation) delete trips; the dashboard reflects the change immediately.

## Dependencies
S1, S3, Epic 01 S4 (archive/delete), Epic 04 (authz).

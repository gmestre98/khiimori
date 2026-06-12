# S4 — Archive & delete (cascade, transactional)

## Context
**Archive** hides a trip from active lists without deleting; **delete** removes the trip and **cascades**
its days/owned entities transactionally (PRD §5.1, §7.7). These are distinct operations with different
data effects.

## Task
Implement archive (status change) and delete (cascading, transactional) for a trip.

## Acceptance criteria
- [ ] **Archive** sets the trip `status` to archived so it is excluded from active lists (Epic 03) but
  retained in storage.
- [ ] **Delete** removes the trip and **cascades** its days and owned entities (and the trip's
  memberships) in **one transaction**; a failure rolls back.
- [ ] Archive is reversible (un-archive) or at least clearly defined; delete is final.
- [ ] Unit tests cover archive (hidden, retained) and delete (cascade removes dependents
  transactionally).

## Constraints
- Use DB-level cascade or an explicit transactional cascade — chosen approach documented; must not leave
  orphans (PRD §7.7).
- Authorization via Epic 04 (`Authorizer`); only an owner may archive/delete in v1.

## Definition of done
Archive hides without deleting; delete cascades transactionally with no orphans; tests green.

## Dependencies
S1, S2, Epic 02 (days are cascade targets). Authz by Epic 04; listing exclusion by Epic 03.

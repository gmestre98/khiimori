# S4 — Cross-module authorization wiring (Budget / Journal / Geo)

## Context
**Every trip-scoped request across all modules** (Trip, Budget, Journal, Geo) must be authorized
server-side through the single `Authorizer` (PRD §5.9). Milestones 05–07 already call the trip
`Authorizer` seam; this story confirms and completes that wiring against the real implementation.

## Task
Ensure Budget, Journal, and Geo trip-scoped endpoints authorize through the `Authorizer`.

## Acceptance criteria
- [ ] Budget (Milestone 05), Journal (Milestone 06), and Geo (Milestone 07) trip-scoped endpoints call the
  single `Authorizer` before reading/writing.
- [ ] Each module depends on the **`Authorizer` interface**, not on querying memberships directly (PRD
  §7.1).
- [ ] An audit/checklist confirms **no trip-scoped endpoint** bypasses the `Authorizer` (input to
  Milestone 10's security review).
- [ ] A test per module confirms an unauthorized user is denied (403/404).

## Constraints
- Modules consume the interface only — the chokepoint stays auditable (PRD §7.1).
- If any module still queries memberships directly, refactor it to the interface.

## Definition of done
All trip-scoped modules authorize via the single `Authorizer`; an audit confirms no bypass.

## Dependencies
S1–S3, Milestones 05–07 (consumers). Feeds Milestone 10 Epic 03 (security review).

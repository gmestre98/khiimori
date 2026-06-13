# S2 — Availability & offline behaviour verification

## Context
**Graceful read-only/offline behaviour** under poor network must be verified, and the **~99.5% API
availability** target understood and monitored (PRD §6).

## Task
Verify graceful availability/offline behaviour and that availability is monitored.

## Acceptance criteria
- [ ] Under throttled/again-offline conditions, the app behaves **gracefully** (read-only/offline shell +
  current-trip viewing, queued writes) — verified, building on Milestone 09's PWA.
- [ ] The **~99.5% API availability** target is documented as understood, and basic **availability
  monitoring** is confirmed in place (Milestone 01 observability).
- [ ] Failure modes (API down, network flaky) degrade gracefully without data loss (offline queue holds
  writes).
- [ ] Results are recorded as a release-gate artifact.

## Constraints
- Drive the PWA under degraded conditions (Milestones 04/06/09); don't mock the offline path away.
- Availability monitoring reuses Milestone 01's observability — confirm, don't rebuild.

## Definition of done
Graceful availability/offline behaviour is verified and availability monitoring is confirmed; results
recorded.

## Dependencies
Milestones 04/06/09 (offline), Milestone 01 (observability/monitoring). Release gate.

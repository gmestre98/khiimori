# S2 — Owner-only shim implementation

## Context
Until Milestone 08's membership-based `Authorizer` lands, a v1 **owner-only shim** implements the
interface: an owner may do everything; non-owners are denied (PRD §7.0). It reads the owner relationship
and the Owner `TripMembership` (Epic 01 S2) so behaviour is already membership-shaped.

## Task
Implement an owner-only `Authorizer` satisfying the S1 interface.

## Acceptance criteria
- [ ] The shim allows all actions for a trip's **owner** and denies non-owners.
- [ ] It resolves ownership from the trip's `owner_id` / Owner `TripMembership` row (Epic 01).
- [ ] It is structured so Milestone 08's membership `Authorizer` is a **drop-in replacement** (same
  interface, no caller changes).
- [ ] Unit tests cover owner-allowed and non-owner-denied for each action.

## Constraints
- Keep it minimal and membership-shaped; do not implement roles (Editor/Viewer) — that is Milestone 08.
- Deny-by-default for anything not explicitly allowed.

## Definition of done
An owner-only `Authorizer` implements the S1 interface and is swap-ready for Milestone 08; tests green.

## Dependencies
S1 (interface), Epic 01 S2 (owner membership). Consumed by S3; replaced by Milestone 08 Epic 02.

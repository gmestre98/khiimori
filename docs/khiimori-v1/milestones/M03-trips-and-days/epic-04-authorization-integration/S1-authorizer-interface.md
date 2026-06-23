# S1 — `Authorizer` interface definition

## Context
The Trip module must never decide access on its own; it delegates to an **`Authorizer` interface** ("may
user U perform action A on trip T?") that Milestone 08 will own and implement fully (PRD §5.9, §7.1).
Defining the seam here keeps the boundary clean and makes the later swap mechanical (PRD §7.0).

## Task
Define the `Authorizer` interface (and the action set it answers for) in a place Milestone 08 can later
implement.

## Acceptance criteria
- [x] An `Authorizer` interface exposes a check like `Can(ctx, userID, action, tripID) → (allowed, error)`
  (or equivalent), with a small **action set** covering trip read/write/manage operations.
- [x] The interface lives at a boundary both the Trip module (now) and the Sharing module (Milestone 08)
  can depend on, with callers depending on the interface, not an implementation (PRD §7.1).
- [x] The action set is documented so Epics 03/05 and later modules call consistent actions.
- [x] No implementation logic here beyond the interface and action definitions.

## Constraints
- Mirror the shape Milestone 08 will implement so swapping the shim (S2) for the real `Authorizer` needs
  no caller changes (PRD §7.0).
- Authentication (who the user is) comes from Milestone 02 middleware; this interface answers *whether*.

## Definition of done
An `Authorizer` interface + action set exists at a clean boundary, depended on by callers, ready for both
the shim (S2) and Milestone 08.

## Dependencies
Milestone 02 (authenticated user). Implemented by S2; consumed by S3; replaced by Milestone 08.

# S1 — Membership-based `Authorizer` implementation

## Context
The **authorization authority**: implement the `Authorizer` interface (defined in Milestone 03 Epic 04 S1)
against `TripMembership`/roles, resolving capabilities per PRD §3 (Owner = full + sharing; Editor = edit
plan/budget/journal; Viewer = read-only) (PRD §3, §5.9).

## Task
Implement a membership/role-based `Authorizer` satisfying the existing interface.

## Acceptance criteria
- [x] The `Authorizer` answers "may user U perform action A on trip T?" using the user's `TripMembership`
  role (reads from Epic 01 S2).
- [x] Capability resolution matches PRD §3: **Owner** (full control + sharing), **Editor** (edit
  plan/budget/journal), **Viewer** (read-only); a non-member is denied.
- [x] It implements the **same interface** Milestone 03 defined, so it is a drop-in replacement for the
  owner-only shim (PRD §7.0).
- [x] Deny-by-default for any action not explicitly granted.
- [x] A unit test covers each role against representative read/write/manage actions.

## Constraints
- Implement the existing interface exactly (no signature changes) so callers need no edits.
- Capability resolution is centralised here; modules ask "may U do A on T", not "what role is U".

## Definition of done
A membership/role-based `Authorizer` resolves capabilities per PRD §3 behind the existing interface; tests
green.

## Dependencies
Milestone 03 Epic 04 S1 (interface), Epic 01 S2 (membership reads). Swap-in in S2.

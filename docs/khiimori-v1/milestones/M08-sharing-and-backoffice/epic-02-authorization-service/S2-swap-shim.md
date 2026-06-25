# S2 — Swap owner-only shim for the real `Authorizer`

## Context
The membership `Authorizer` (S1) **drop-in replaces** Milestone 03's owner-only shim across all consumers,
with no caller changes (PRD §7.0). This is the mechanical swap the seam was designed for.

## Task
Wire the membership `Authorizer` as the implementation used everywhere the shim was.

## Acceptance criteria
- [x] The composition/wiring provides the membership `Authorizer` (S1) wherever the owner-only shim was
  injected.
- [x] Trip endpoints (Milestone 03) and any other current consumers now use the real `Authorizer` with **no
  caller code changes**.
- [x] Milestone 03's authorization tests (owner allowed / non-owner denied) **still pass** unchanged
  (behaviour-level).
- [x] Editor/Viewer behaviours now resolve correctly where previously only owner was allowed.

## Constraints
- No interface/signature changes — only the injected implementation changes (PRD §7.0).
- Keep the shim available for tests if useful, but production uses the real `Authorizer`.

## Definition of done
The real `Authorizer` is used everywhere the shim was; existing authz tests pass; roles now resolve.

## Dependencies
S1, Milestone 03 Epic 04 (shim + consumers). Cross-module wiring in S4.

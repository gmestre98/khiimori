# S5 — Cross-module role-enforcement tests

## Context
Epic AC5 requires unit + integration tests covering role enforcement **across modules** (Owner / Editor /
Viewer / non-member) — authorization is safety-critical and gets thorough coverage (PRD §7.6, §7.7).

## Task
Add cross-module authorization tests for each role.

## Acceptance criteria
- [x] Integration tests cover, **for each module** (Trip, Budget, Journal, Geo): **Owner** (full),
  **Editor** (edit plan/budget/journal, not sharing), **Viewer** (read-only), **non-member** (denied).
- [x] Tests assert **server-side** enforcement (unauthorized → 403/404, not data) — not hidden UI.
- [x] Tests cover **revocation** and **role downgrade** taking effect immediately (S3).
- [x] Tests run against the real membership `Authorizer` (S1/S2), reusing the M01.3 harness.

## Constraints
- Treat authorization as safety-critical — broad coverage (PRD §7.7).
- Reuse Milestone 02 test sessions and the M01.3 integration harness.

## Definition of done
Role enforcement across all trip-scoped modules is covered by green integration tests.

## Dependencies
S1–S4, M01.3 S7 (harness), Milestone 02 (sessions). Satisfies epic AC5; re-verified in Milestone 10.

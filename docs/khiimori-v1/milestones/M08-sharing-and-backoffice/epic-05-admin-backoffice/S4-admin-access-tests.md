# S4 — Admin access-control tests

## Context
Epic AC requires tests for admin access control (admin allowed, non-admin denied) and the grant/revoke/
deactivate operations (PRD §7.6). Admin gating is safety-relevant.

## Task
Add tests for admin gating and the admin operations.

## Acceptance criteria
- [x] Tests assert **non-admins cannot reach the backoffice** — both the route and its endpoints reject
  non-admins server-side (`403`).
- [x] Tests assert an `is_admin` user **can** reach the backoffice and perform the reads/actions.
- [x] Integration tests cover **grant/revoke**, **change role**, and **deactivate user** (including that a
  deactivated user is blocked from auth).
- [x] Tests run against the real gating + membership/auth implementations (M01.3 harness, Milestone 02
  sessions).

## Constraints
- Treat admin gating as safety-relevant — cover the denied paths thoroughly (PRD §5.9).
- Reuse the M01.3 harness; hermetic state.

## Definition of done
Admin gating and operations are covered by green tests, including non-admin denial and deactivation.

## Dependencies
S1–S3, M01.3 S7 (harness), Milestone 02 (sessions). Satisfies epic AC4; feeds Milestone 10 review.

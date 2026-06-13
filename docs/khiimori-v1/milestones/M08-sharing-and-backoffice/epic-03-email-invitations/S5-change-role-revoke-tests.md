# S5 — Change role / revoke & invitation tests

## Context
An Owner can **change a member's role** or **revoke** an invitation/membership; revocation removes
visibility/edit ability immediately (via Epic 02) (PRD §5.9). Epic AC requires tests for invite → accept →
membership, role change, and revoke (PRD §7.6).

## Task
Implement change-role/revoke for invites & memberships and add the invitation test suite.

## Acceptance criteria
- [ ] An Owner can **change a member's role** (Editor↔Viewer) and **revoke** a membership or a pending
  invitation.
- [ ] Revocation removes access **immediately** (next request denied, via Epic 02 S3).
- [ ] Integration tests cover **invite → accept → membership**, **role change**, and **revoke** (pending
  and accepted).
- [ ] A test covers that only an Owner can change roles/revoke.

## Constraints
- Reuse Epic 01 lifecycle ops and Epic 02 enforcement; do not add a parallel path.
- Reuse the M01.3 integration harness and Milestone 02 sessions.

## Definition of done
Role change/revoke work with immediate effect and the invitation lifecycle is covered by green tests.

## Dependencies
S1–S4, Epic 01 (lifecycle), Epic 02 (enforcement), M01.3 S7 (harness). Satisfies epic AC5.

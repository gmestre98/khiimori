# S3 — Grant/revoke access, change roles, deactivate users

## Context
The admin can **grant/revoke trip access and change roles**, and **deactivate users** (PRD §5.9). These
reuse the membership lifecycle (Epic 01) and add user deactivation via the `auth` module.

## Task
Implement the admin actions for trip access, roles, and user deactivation.

## Acceptance criteria
- [ ] An admin can **grant/revoke** a user's access to a trip and **change their role** (reusing Epic 01
  lifecycle + Epic 02 enforcement).
- [ ] An admin can **deactivate a user** (e.g. an active/disabled flag on `auth.User`) so a deactivated
  user can **no longer authenticate** (Milestone 02 honours the flag).
- [ ] All actions are gated by `is_admin` (S1) server-side and are transactional where multi-step.
- [ ] A unit/integration test covers each action and that a deactivated user cannot sign in / is rejected.

## Constraints
- Reuse Epic 01 membership ops and Epic 02 enforcement — the backoffice is a thin operator UI, not a
  parallel authorization path.
- Deactivation goes through the `auth` module (coordinate with Milestone 02's session/auth so a
  deactivated user's sessions are invalidated or rejected).

## Definition of done
An admin can grant/revoke access, change roles, and deactivate users (blocking their auth); tests green.

## Dependencies
S1, S2, Epic 01 (lifecycle), Epic 02 (enforcement), Milestone 02 (auth/deactivation hook). Tested in S4.

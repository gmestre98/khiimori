# S2 — Members list, change role & revoke

## Context
The sharing surface **lists current members and their roles**, and lets the Owner **change a role** or
**revoke access**, reflecting changes immediately (PRD §5.9). Drives Epic 01/03 operations.

## Task
Build the members list with change-role and revoke controls.

## Acceptance criteria
- [x] The surface lists current members with their **roles** (from Epic 01 S2 reads).
- [x] An Owner can **change a member's role** (Editor↔Viewer) and **revoke** access; the list updates
  immediately.
- [x] Revoked members disappear from the list and lose access (Epic 02 enforces immediately).
- [x] Manage controls are visible only to a user with Owner capability (server still enforces).

## Constraints
- Reflect server-confirmed state after each change; do not assume success client-side for authorization.
- Reuse Epic 01/03 operations; no parallel logic.

## Definition of done
An Owner can view members, change roles, and revoke access with the list reflecting changes immediately.

## Dependencies
S1, Epic 01 (lifecycle), Epic 03 (revoke/role), Epic 02 (capability). Visibility check in S3.

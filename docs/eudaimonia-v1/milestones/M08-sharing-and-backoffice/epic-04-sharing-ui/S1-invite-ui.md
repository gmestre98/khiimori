# S1 — Invite UI (email + role, status)

## Context
An Owner can **invite a companion by email** with a role (Editor/Viewer) and **see the invitation's
status** from the trip's sharing surface (PRD §5.9, §11.1). Drives Epic 03's invite API.

## Task
Build the invite UI on the trip sharing surface.

## Acceptance criteria
- [ ] From a trip's sharing surface, an Owner can enter an **email** and pick a **role** (Editor/Viewer)
  and send an invite (Epic 03 S3).
- [ ] The surface shows pending invitations and their **status** (sent/accepted).
- [ ] Invite controls are visible only to a user with Owner capability (server still enforces — Epic 02).
- [ ] The surface is responsive (web + mobile); Milestone 09 components when available.

## Constraints
- Render server-decided capability/state; the client never decides authorization (PRD §5.9).
- Only Editor/Viewer roles offered (no Owner invites, PRD §11.1).

## Definition of done
An Owner can invite by email + role and see invite status from the trip's sharing surface.

## Dependencies
M03 Epic 05 (trip shell), Epic 03 (invite API), Epic 02 (capability). Members management in S2.

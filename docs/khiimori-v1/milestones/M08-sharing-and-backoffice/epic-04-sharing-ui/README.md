# Epic M08.4 — Sharing UI (frontend)

> Milestone: [08 — Sharing & Backoffice](../README.md) · PRD refs: §5.9, §5.10, §7.2, §11.1.

## Description

Build the **trip sharing surface** in the web app: an Owner can **invite a companion by email** with
a role (Editor/Viewer), **see current members**, **change a role**, and **revoke access**. Invited
users see **only the trips shared with them** in their Trips menu (driven by Milestone 03's
authorization-scoped listing). This is the user-facing front of Epics 01–03.

**Estimated effort:** ~1–2 developer-days (one developer).

> **Status:** ✅ Done — PRs [#352](https://github.com/gmestre98/khiimori/pull/352), [#353](https://github.com/gmestre98/khiimori/pull/353), [#354](https://github.com/gmestre98/khiimori/pull/354). All 4 ACs complete across 3 stories.

## Acceptance Criteria

- [x] An Owner can **invite by email + role** (Editor/Viewer) and see the invitation's status from
      the trip's sharing surface (PRD §5.9, §11.1).
- [x] The surface **lists current members and their roles**, and lets the Owner **change a role** or
      **revoke access**, reflecting changes immediately (PRD §5.9).
- [x] Invited users see **only trips shared with them** in their Trips menu (rendered from Milestone
      03's authorization-scoped listing — the client never decides authorization) (PRD §5.9).
- [x] The surface is mobile-first and responsive, using Milestone 09 components when available
      (PRD §5.10, §7.2).

## Implementation Details / Architecture

- Part of the **`/web` React + TypeScript** app (PRD §7.2), rendered within Milestone 03's trip
  shell.
- All actions go through Epics 01–03 APIs; the UI **renders** server-decided state (members, roles,
  invite status) and never makes authorization decisions itself (PRD §5.9).
- Role/permission affordances reflect the viewer's own capability (e.g. only an Owner sees invite/
  revoke controls) — but enforcement is always server-side (Epic 02).

## Dependencies

- **Upstream:** Epics 01–03 (membership, authorization, invitations), Milestone 03 (trip shell +
  scoped listing), Milestone 02 (auth context).
- **Downstream:** Milestone 10's shared-trip journey; Milestone 09 restyles this surface.

## Costs Impact

Negligible — static assets served from Firebase Hosting free tier (PRD §8.1).

## Designs

Trip sharing / access control UI:
[assets/03-mobile-and-sharing.svg](../../../assets/03-mobile-and-sharing.svg) (PRD §4.3, §5.10).

## User stories

The epic is split into **3 small user stories**, each sized **≤4h for one developer** (implementation +
tests + review). Each story file is a standalone agent-ready prompt with enough context to implement it
without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-invite-ui.md) | Invite UI (email + role, status) | ~3h | AC1 | M03 Epic 05, Epic 03, Epic 02 |
| [S2](S2-members-management.md) | Members list, change role & revoke | ~3h | AC2 | S1, Epics 01/03 |
| [S3](S3-invited-only-visibility.md) | Invited-only trip visibility & tests | ~2.5h | AC3, AC4 | S1, S2, M03 |

**Total:** ~8.5h (≈ 1–2 dev-days), consistent with the epic's ~1–2 dev-day estimate.

### Sequencing

```
S1 Invite UI ── S2 Members management ── S3 Invited-only visibility & tests
```

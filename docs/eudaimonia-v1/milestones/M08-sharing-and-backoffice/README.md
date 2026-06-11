# Milestone 08 — Sharing & Backoffice

**Status:** Milestone overview — to be split into focused epics (≤5 acceptance criteria each) following the [Milestone 01](../M01-foundations/README.md) pattern. The criteria below are the milestone-level spec and the source material for that split.

> Trip memberships and roles, email invitations, the server-side authorization that guards all
> trip data, and a minimal admin backoffice for users and trip access.
>
> PRD refs: §3 (roles), §5.9, §6 (Security/Privacy), §9 (TripMembership, Invitation),
> §7.1 (Sharing/Access module), §11.1 (companion model decided).

---

## Description

Make trips **shareable at the right permission level**, and make **authorization trustworthy**.
A trip owner can **invite a companion by email** and assign a role — **Editor or Viewer** only in
v1 (PRD §11.1). Invited users see **only** the trips shared with them. A separate, minimal
**Admin backoffice** lets the operator (initially the author) **list users, list trips, manage who
can access which trip** (grant/revoke, change role), and **deactivate users**. Crucially, **all
trip data access is enforced server-side by this Sharing/Access module** — the UI never decides
authorization on its own (PRD §5.9, §6). This module is the **authorization authority** every
other epic calls.

## Acceptance Criteria

**Sharing (PRD §5.9, §11.1):**
- [ ] A trip **Owner** can **invite a companion by email** and assign role **Editor** or **Viewer**
      (no per-section permissions in v1).
- [ ] Roles behave per PRD §3: **Owner** = full control + sharing; **Editor** = edit
      plan/budget/journal; **Viewer** = read-only.
- [ ] Invited users see **only trips shared with them** in their Trips menu (PRD §5.9).
- [ ] An invitation has a lifecycle (`status`, `token`) — sent → accepted; accepting links the
      invite's email to the signed-in user's account and creates a `TripMembership` (PRD §9).
- [ ] Owner can **change a member's role** or **revoke access**; revocation immediately removes
      visibility/edit ability.

**Authorization (PRD §5.9, §6 — the critical guarantee):**
- [ ] **Every trip-scoped request across all modules** (Trip, Budget, Journal, Geo) is authorized
      **server-side** against `TripMembership` before any data is read or written.
- [ ] The Sharing module exposes a **single authorization interface** (e.g. "may user U perform
      action A on trip T?") consumed by Epics 03–07 — the one place trip authz is decided.
- [ ] Unauthorized access yields `403`/`404` (not data); no endpoint relies on client-side checks.

**Backoffice (PRD §5.9):**
- [ ] An **Admin** (`is_admin`, from Epic 02) can access a **separate, minimal backoffice**.
- [ ] Admin can **list users**, **list trips**, **grant/revoke trip access and change roles**, and
      **deactivate users**.
- [ ] Non-admins cannot reach the backoffice (server-side enforced).

**Quality:**
- [ ] Unit + integration tests for role enforcement across modules, invite accept/revoke, and
      admin access control — authorization is **safety-critical** (PRD §7.7) and gets thorough
      coverage (PRD §7.6).

## Implementation Details / Architecture

- Lives in the **`sharing` module** (PRD §7.1, "Sharing / Access") with the `sharing.*` schema
  (PRD §7.7).
- Entities (PRD §9):
  - `TripMembership(id, trip_id, user_id, role)` — roles `Owner | Editor | Viewer`. The `Owner`
    row is created by Epic 03; this module owns the full lifecycle and reads.
  - `Invitation(id, trip_id, email, role, status, token)`.
- **Authorization as a service interface (PRD §5.9, §7.1):** every other module depends on this
  module's `Authorizer` interface rather than querying memberships directly. This is the clean
  boundary that lets Sharing be split into its own service later without changing callers
  (PRD §7.0, §7.1) — and the single chokepoint that makes server-side enforcement auditable.
- **Referential integrity (PRD §7.7):** memberships/invitations use foreign keys and transactional
  updates so access changes can't leave orphaned or over-shared data — the PRD's stated reason for
  choosing a relational DB for safety-critical access control.
- **Invitations by email (PRD §5.9):** an invite is sent to an email; on the invitee's Google
  sign-in (Epic 02), a matching email claims the invitation and gains membership. Transactional
  email (e.g. Resend/Brevo free tier) sends the invite (PRD §8.1).
- **Backoffice** is a **separate, minimal admin surface** (PRD §5.9) — a distinct route/area gated
  by `is_admin`, intentionally small.

## Dependencies

- **Upstream:** Epic 02 (identity, `is_admin` bootstrap), Epic 03 (Trip/Membership owner row),
  Epic 01 (DB/service, transactional email config).
- **Downstream / cross-cutting:** Epics 03–07 **consume this module's authorization interface**;
  Epic 03's owner-only authz shim is replaced by the real membership check here. The shared-trip
  authorization journey is exercised by Epic 10.

## Costs Impact

Low. Memberships/invitations are small relational rows in the existing Neon DB. The one new
billable touchpoint is **transactional email** for invites — covered by a **free tier (~3k
emails/mo)** at expected volume, **€0** (PRD §8.1). No other cost impact.

## Designs

Trip sharing / access control UI:
[assets/03-mobile-and-sharing.svg](../assets/03-mobile-and-sharing.svg) (PRD §4.3). The backoffice
is an intentionally minimal admin surface (PRD §5.9) using the same black/white system (Epic 09).

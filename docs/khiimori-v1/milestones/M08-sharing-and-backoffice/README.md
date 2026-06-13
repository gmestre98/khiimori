# Milestone 08 — Sharing & Backoffice

> Trip memberships and roles, email invitations, the **single server-side authorization authority**
> that guards all trip data, and a minimal admin backoffice for users and trip access.
>
> PRD refs: §3 (roles), §5.9, §6 (Security/Privacy), §9 (TripMembership, Invitation),
> §7.1 (Sharing/Access module), §11.1 (companion model decided).

---

## Milestone goal

Make trips **shareable at the right permission level** and make **authorization trustworthy**. A
trip owner can **invite a companion by email** and assign a role — **Editor or Viewer** only in v1.
Invited users see **only** the trips shared with them. A separate, minimal **Admin backoffice** lets
the operator list users, list trips, manage who can access which trip (grant/revoke, change role),
and deactivate users. Crucially, **all trip data access is enforced server-side by this
Sharing/Access module** via a **single `Authorizer` interface** consumed by Milestones 03–07 — the
one place trip authorization is decided. This milestone replaces Milestone 03's owner-only shim with
the real membership-based check.

## Milestone-level Definition of Done

- An **Owner** can **invite a companion by email** with role **Editor** or **Viewer**; the invite
  has a lifecycle (`status`, `token`) and on the invitee's sign-in their email **claims the invite
  and creates a `TripMembership`** (PRD §5.9, §9, §11.1).
- Roles behave per PRD §3 (Owner = full control + sharing; Editor = edit plan/budget/journal; Viewer
  = read-only); an Owner can **change a member's role or revoke access**, and **invited users see
  only trips shared with them** (PRD §3, §5.9).
- **Every trip-scoped request across all modules** is authorized **server-side** against
  `TripMembership` via a **single `Authorizer` interface**; unauthorized access yields `403`/`404`,
  never data, and no endpoint relies on client-side checks (PRD §5.9, §6).
- A separate **Admin backoffice** (gated by `is_admin`) can **list users, list trips, grant/revoke
  trip access, change roles, and deactivate users**; non-admins cannot reach it (PRD §5.9).
- Unit + integration tests cover role enforcement across modules, invite accept/revoke, and admin
  access control — authorization is **safety-critical** and gets thorough coverage (PRD §7.6, §7.7).

## Epics in this milestone

| Epic | Title | AC | Est. (dev-days) | Cost-relevant |
|------|-------|----|-----------------|---------------|
| [01](epic-01-membership-roles-model/README.md) | Membership & roles model (`sharing.*`) | 4 | ~1–2 | — |
| [02](epic-02-authorization-service/README.md) | Authorization service (single `Authorizer`) | 5 | ~2–3 | — |
| [03](epic-03-email-invitations/README.md) | Email invitations (lifecycle, accept, revoke) | 5 | ~2–3 | yes (transactional email, free tier) |
| [04](epic-04-sharing-ui/README.md) | Sharing UI (frontend) | 4 | ~1–2 | — |
| [05](epic-05-admin-backoffice/README.md) | Admin backoffice | 4 | ~2 | — |
| | **Milestone total** | **22** | **~8–12** (≈ 2–2.5 weeks, one developer) | — |

> **Estimates** assume one developer familiar with the stack; they cover implementation, tests, and
> review. Epic 02 (the authorization authority) is safety-critical and gets the most test attention.

## Sequencing within the milestone

```
01 Membership & roles model ──┬─ 02 Authorization service ──┬─ 04 Sharing UI
                              ├─ 03 Email invitations ───────┤
                              └───────────────────────────────┴─ 05 Admin backoffice
```

## Designs

Trip sharing / access control UI:
[assets/03-mobile-and-sharing.svg](../../assets/03-mobile-and-sharing.svg) (PRD §4.3). The backoffice
is an intentionally minimal admin surface (PRD §5.9) using the same black/white system (Milestone
09).

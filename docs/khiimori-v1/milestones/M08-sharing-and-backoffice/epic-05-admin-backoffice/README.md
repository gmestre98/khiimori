# Epic M08.5 — Admin backoffice

> Milestone: [08 — Sharing & Backoffice](../README.md) · PRD refs: §5.9, §6, §7.2.

## Description

Provide a separate, **minimal admin backoffice** for the operator (initially the author). Gated by
`is_admin` (bootstrapped in Milestone 02), it lets the admin **list users**, **list trips**,
**grant/revoke trip access and change roles**, and **deactivate users**. It is intentionally small —
a distinct route/area, server-side enforced, not a public self-serve admin product.

**Estimated effort:** ~2 developer-days (one developer).

## Acceptance Criteria

- [ ] An **`is_admin` user** (from Milestone 02) can access a **separate, minimal backoffice**; the
      gate is enforced **server-side** (PRD §5.9).
- [ ] The admin can **list users** and **list trips**, **grant/revoke trip access and change roles**
      (via Epics 01–02), and **deactivate users** (PRD §5.9).
- [ ] **Non-admins cannot reach the backoffice** — both the route and its endpoints reject
      non-admins server-side (PRD §5.9, §6).
- [ ] Unit + integration tests cover admin access control (admin allowed, non-admin denied) and the
      grant/revoke/deactivate operations (PRD §7.6).

## Implementation Details / Architecture

- A **distinct admin surface** in the `/web` app plus admin endpoints in the `sharing`/`auth`
  modules, gated by `is_admin` server-side (PRD §5.9, §7.2).
- Grant/revoke/role-change reuse Epic 01's membership lifecycle and Epic 02's enforcement — the
  backoffice is a thin operator UI over existing capabilities, not a parallel authorization path.
- **Deactivating a user** is handled via the `auth` module (e.g. an active/disabled flag on `User`)
  so a deactivated user can no longer authenticate; the backoffice triggers it.
- Kept intentionally minimal (PRD §5.9) — no analytics/dashboards in v1.

## Dependencies

- **Upstream:** Milestone 02 (`is_admin` bootstrap, user deactivation hook), Epics 01–02 (membership
  + authorization).
- **Downstream:** Milestone 10 verifies admin access control as part of the security review.

## Costs Impact

Negligible — admin reads/writes are small operations on the existing Neon database; static admin
assets on Firebase Hosting free tier (PRD §8.1).

## Designs

An intentionally minimal admin surface (PRD §5.9) using the same black/white system as the rest of
the app (Milestone 09). No dedicated mockup beyond the shared design language.

## User stories

The epic is split into **4 small user stories**, each sized **≤4h for one developer** (implementation +
tests + review). Each story file is a standalone agent-ready prompt with enough context to implement it
without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-admin-gating.md) | Admin gating & backoffice route | ~3h | AC1, AC3 | M02 (`is_admin`) |
| [S2](S2-list-users-trips.md) | List users & list trips | ~3h | AC2 | S1, M02, M03 |
| [S3](S3-admin-actions.md) | Grant/revoke access, change roles, deactivate users | ~3.5h | AC2 | S1, S2, Epics 01/02, M02 |
| [S4](S4-admin-access-tests.md) | Admin access-control tests | ~2.5h | AC4 | S1–S3 |

**Total:** ~12h (≈ 2 dev-days), consistent with the epic's ~2 dev-day estimate.

### Sequencing

```
S1 Admin gating ── S2 List users & trips ── S3 Admin actions ── S4 Access-control tests
```

This completes the per-epic story breakdown for **Milestone 08 (5 epics)**.

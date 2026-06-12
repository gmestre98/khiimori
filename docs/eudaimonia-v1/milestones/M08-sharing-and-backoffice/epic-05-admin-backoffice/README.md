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

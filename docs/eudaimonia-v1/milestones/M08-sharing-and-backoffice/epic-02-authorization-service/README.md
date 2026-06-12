# Epic M08.2 — Authorization service (single `Authorizer`)

> Milestone: [08 — Sharing & Backoffice](../README.md) · PRD refs: §5.9, §6, §7.0, §7.1, §7.7.

## Description

The **authorization authority**. Implement the **single `Authorizer` interface** ("may user U
perform action A on trip T?") that **every** trip-scoped request across all modules (Trip, Budget,
Journal, Geo) calls **server-side** before any data is read or written. This replaces Milestone 03's
owner-only shim with the real membership/role-based check from Epic 01. It is the one place trip
authorization is decided — the auditable chokepoint the whole system depends on.

**Estimated effort:** ~2–3 developer-days (one developer).

## Acceptance Criteria

- [ ] The **`Authorizer` interface** is implemented against `TripMembership`/roles (Epic 01),
      resolving capabilities per PRD §3 (Owner = full + sharing; Editor = edit plan/budget/journal;
      Viewer = read-only) (PRD §3, §5.9).
- [ ] **Every trip-scoped request** in Milestones 03–07 is authorized **server-side** through this
      interface before reading/writing; it **drop-in replaces** Milestone 03's owner-only shim
      (PRD §5.9, §7.0).
- [ ] **Unauthorized** access yields **`403`/`404`** (not data); **no endpoint relies on client-side
      checks** (PRD §5.9, §6).
- [ ] **Revocation takes effect immediately** — a revoked member loses visibility/edit ability on the
      next request (PRD §5.9).
- [ ] Unit + integration tests cover role enforcement **across modules** (Owner/Editor/Viewer/
      non-member) — authorization is safety-critical and gets thorough coverage (PRD §7.6, §7.7).

## Implementation Details / Architecture

- Lives in the **`sharing` module** (PRD §7.1). Every other module depends on the **`Authorizer`
  interface** rather than querying memberships directly — the clean boundary that lets Sharing split
  into its own service later and the single chokepoint that makes server-side enforcement auditable
  (PRD §7.0, §7.1).
- The interface mirrors the shim Milestone 03 defined, so swapping in this implementation is
  mechanical (no caller changes).
- Capability resolution is centralised here; modules ask "may U do A on T", not "what role is U".

## Dependencies

- **Upstream:** Epic 01 (membership/role data), Milestone 02 (authenticated user), Milestone 03
  (the `Authorizer` seam + owner-only shim it replaces).
- **Downstream / cross-cutting:** Milestones 03–07 consume this; Milestone 10 verifies authorization
  on every endpoint.

## Costs Impact

Negligible — authorization checks are small reads in the existing Neon database (PRD §8, free tier).

## Designs

No UI — this is the server-side access guarantee behind every trip surface (PRD §5.9, §6).

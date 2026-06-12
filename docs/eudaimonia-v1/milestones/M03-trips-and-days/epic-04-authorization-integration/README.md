# Epic M03.4 — Server-side authorization integration

> Milestone: [03 — Trips & Days](../README.md) · PRD refs: §5.9, §6, §7.0, §7.1.

## Description

Ensure **every trip read/write is authorized server-side**: a user may only see and modify trips
they own or are a member of. Milestone 03 consumes the **authenticated user** from Milestone 02 and
delegates the access decision to an `Authorizer` interface so the Trip module never decides access
on its own. Until Milestone 08's full Sharing module lands, an **owner-only authorization shim**
implements that interface; swapping in the real membership check later requires no caller changes
(PRD §7.0).

**Estimated effort:** ~1–2 developer-days (one developer).

## Acceptance Criteria

- [ ] An **`Authorizer` interface** ("may user U perform action A on trip T?") is defined and called
      by every trip read/write path; the Trip module never queries access rules inline (PRD §5.9,
      §7.1).
- [ ] A v1 **owner-only shim** implements the interface (owner may do everything; non-owners are
      denied), structured so Milestone 08's membership-based `Authorizer` is a drop-in replacement
      (PRD §7.0).
- [ ] **Unauthorized** trip access yields `403`/`404` (not data); no trip endpoint relies on
      client-side checks (PRD §5.9, §6).
- [ ] Unit + integration tests cover owner-allowed and non-owner-denied paths across create/read/
      update/delete and the listing (PRD §7.6).

## Implementation Details / Architecture

- Lives in the **`trip` module** but depends on the **`Authorizer` interface** that Milestone 08
  (Sharing/Access) will own and implement fully (PRD §5.9, §7.1). Defining the seam here keeps the
  boundary clean and the migration to real memberships mechanical.
- Authorization is layered on top of **authentication** (Milestone 02 middleware): the middleware
  says *who*, the `Authorizer` says *whether*.
- The shim reads the owner relationship (and the `Owner` `TripMembership` from Epic 01) so behaviour
  is already membership-shaped before Milestone 08 generalises it.

## Dependencies

- **Upstream:** Milestone 02 (authenticated user), Epic 01 (Trip + owner membership).
- **Downstream / soft:** Milestone 08 replaces the shim with the real `Authorizer`; Epic 03's
  listing and Milestones 04–07 all call through this interface.

## Costs Impact

Negligible — authorization checks are small reads in the existing Neon database (PRD §8, free tier).

## Designs

No UI — this is the server-side access guarantee behind every trip surface (PRD §5.9, §6).

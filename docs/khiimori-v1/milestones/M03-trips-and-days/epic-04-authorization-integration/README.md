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
- [x] A v1 **owner-only shim** implements the interface (owner may do everything; non-owners are
      denied), structured so Milestone 08's membership-based `Authorizer` is a drop-in replacement
      (PRD §7.0).
- [x] **Unauthorized** trip access yields `403`/`404` (not data); no trip endpoint relies on
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

## User stories

The epic is split into **4 small user stories**, each sized **≤4h for one developer** (implementation +
tests + review). Each story file is a standalone agent-ready prompt with enough context to implement it
without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-authorizer-interface.md) | `Authorizer` interface definition | ~2.5h | AC1 | Milestone 02 |
| [S2](S2-owner-only-shim.md) | Owner-only shim implementation | ~2.5h | AC2 | S1, Epic 01 S2 |
| [S3](S3-wire-authz-endpoints.md) | Wire authorization into trip read/write paths | ~3h | AC3 | S1, S2, Epics 01/03 |
| [S4](S4-authz-tests.md) | Authorization tests (owner allowed / non-owner denied) | ~2.5h | AC4 | S1–S3 |

**Total:** ~10.5h (≈ 1–2 dev-days), consistent with the epic's ~1–2 dev-day estimate.

### Sequencing

```
S1 Authorizer interface ── S2 Owner-only shim ── S3 Wire into endpoints ── S4 Authz tests
```

> Milestone 08 Epic 02 replaces the S2 shim with the membership-based `Authorizer` — no caller changes,
> and S4's behaviour-level tests keep passing.

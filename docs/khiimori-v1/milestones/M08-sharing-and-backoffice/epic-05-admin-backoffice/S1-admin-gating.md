# S1 — Admin gating & backoffice route

## Context
The backoffice is a **separate, minimal admin surface** gated by `is_admin` (bootstrapped in Milestone 02),
enforced **server-side** (PRD §5.9). This story establishes the gate and the route shell.

## Task
Implement server-side admin gating and a distinct backoffice route/area.

## Acceptance criteria
- [x] Admin endpoints require **`is_admin`** (from Milestone 02), enforced **server-side**; non-admins
  receive `403`.
- [x] A **distinct admin route/area** exists in the `/web` app, separate from the normal app surfaces.
- [x] The admin area is reachable only by an `is_admin` user; non-admins cannot navigate to it (and the
  endpoints reject them regardless).
- [x] A unit test covers admin-allowed and non-admin-denied at the endpoint level.

## Constraints
- Server-side gating is authoritative; client route-hiding is convenience only (PRD §5.9, §6).
- Keep the backoffice intentionally minimal (PRD §5.9) — a distinct small area.

## Definition of done
A server-gated admin backoffice route exists, reachable only by `is_admin`; tests green.

## Dependencies
Milestone 02 (`is_admin`). Consumed by S2–S4.

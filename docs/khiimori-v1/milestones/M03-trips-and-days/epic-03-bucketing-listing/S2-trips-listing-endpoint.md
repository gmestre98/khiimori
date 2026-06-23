# S2 — Trips listing endpoint (authorization-scoped)

## Context
A listing endpoint returns the user's trips grouped into **Current / Upcoming / Past**, excluding archived
trips, with the current trip identifiable (PRD §5.1). The listing is **authorization-scoped** — a user
only sees trips they own or are a member of — via Epic 04's authz layer (PRD §5.9).

## Task
Implement a `GET /trips` endpoint that returns the authenticated user's trips, bucketed and scoped.

## Acceptance criteria
- [x] The endpoint returns the user's trips grouped into **Current / Upcoming / Past** using S1's function
  with a server-supplied `today`.
- [x] **Archived** trips are excluded from the active buckets.
- [x] The response marks the **current trip** so Epic 05 can surface it prominently.
- [x] The listing is **scoped to trips the user may see** (owner or member) by calling Epic 04's authz
  layer — not by client-side filtering (PRD §5.9).

## Constraints
- Compute buckets server-side (S1); the client does not bucket.
- Use Epic 04's `Authorizer`/scoping seam; until Milestone 08, the owner-only shim governs visibility.

## Definition of done
`GET /trips` returns scoped, bucketed trips with archived excluded and the current trip flagged.

## Dependencies
S1 (bucketing), Epic 01 (trips), Epic 04 (authz scoping). Consumed by Epic 05.

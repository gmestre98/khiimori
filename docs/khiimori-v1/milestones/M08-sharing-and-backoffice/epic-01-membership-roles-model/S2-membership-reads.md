# S2 — Membership reads for authorization & listing

## Context
Membership **reads** feed the authorization service (Epic 02) and Milestone 03's trips listing ("which
trips can user U see") (PRD §5.9). This story exposes those reads.

## Task
Expose membership reads needed by authorization and trip listing.

## Acceptance criteria
- [x] A read returns a user's memberships (the trips they belong to and at what role) — used by the trips
  listing scope (Milestone 03 S2 / Epic 03).
- [x] A read returns a trip's members (and roles) — used by the sharing UI (Epic 04) and admin (Epic 05).
- [x] A read answers "what role does user U have on trip T?" for the `Authorizer` (Epic 02).
- [x] A unit test covers each read shape.

## Constraints
- Reads are the inputs to Epic 02's capability resolution — keep them simple and fast (indexed by
  `user_id` and `trip_id`).
- The Owner row created in Milestone 03 is recognised here.

## Definition of done
Membership reads exist for authorization, trip listing, and member management; tests green.

## Dependencies
S1, Milestone 03 S2 (membership table). Consumed by Epic 02, Milestone 03 listing, Epics 04–05.

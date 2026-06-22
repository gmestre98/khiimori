# S2 — Trip create + owner membership (transaction)

## Context
Creating a trip must also record the creator as a `TripMembership` with role **Owner**, in the same
transaction (PRD §5.1, §9). The membership lifecycle is owned by Milestone 08, but the **Owner row is
created here**. To avoid a later data redesign (PRD §7.0), the membership table is introduced now in the
`sharing.*` schema so Milestone 08 extends rather than migrates it.

## Task
Implement trip creation that persists the `Trip` and an Owner `TripMembership` transactionally.

## Acceptance criteria
- [x] A create endpoint persists a `Trip` (name, destinations, start/end date, cover, `base_currency =
  EUR`, status = active) with `owner_id` from the authenticated user (Milestone 02 middleware).
- [x] A migration introduces a `TripMembership(id, trip_id, user_id, role)` table (in the `sharing`
  schema, FK to trip/user) and an **Owner** row is created for the creator.
- [x] Trip + owner membership are created in **one transaction**; failure rolls back both.
- [x] A unit test covers create with the owner-membership row written.

## Constraints
- Place `TripMembership` in the `sharing.*` schema so Milestone 08 owns its full lifecycle without a data
  redesign (PRD §7.0, §7.7) — document this decision in the story/epic.
- `EUR`, `status`, and `owner_id` are set server-side, not from client input.

## Definition of done
Creating a trip writes the trip and its Owner membership atomically; test green.

## Dependencies
S1 (trip schema), Milestone 02 (auth user). Owner membership consumed by Epic 04 (authz) and Milestone 08.

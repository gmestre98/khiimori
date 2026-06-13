# S3 — Internal module package skeletons

> **Status:** ✅ Done.

## Context
The backend is a modular monolith whose internal modules mirror the target microservice boundaries,
so any one can later be peeled into its own service **without changing the domain model**. This story
makes those boundaries physically present as empty-but-real Go packages.

Assumes the Go module and `/cmd/api` from **S2** exist.

## Task
Create one Go package per domain module under `backend/internal/`, each compiling and independently
testable, with a doc comment describing its responsibility.

## Module packages and responsibilities
- `platform` — shared infra/cross-cutting helpers (config, logging, db handles). Not a domain module.
- `auth` — Google SSO, sessions/tokens, user profile.
- `trip` — trips, days, stays, plan items (timed & untimed), ideas backlog.
- `budget` — budgets and actual costs, roll-ups.
- `journal` — journal entries and photo handling.
- `sharing` — membership, roles, invitations, authorization.
- `geo` — geocoding, routing, Google Maps key protection (maps proxy).

## Acceptance criteria
- [x] Packages exist under `backend/internal/`: `platform`, `auth`, `trip`, `budget`, `journal`,
  `sharing`, `geo`.
- [x] Each package compiles independently and has a trivially-passing `_test.go`.
- [x] Each package has a package-level doc comment stating its domain responsibility (text above).
- [x] No package imports another module's package (boundaries enforced separately in S4).

## Constraints
- Empty-but-real: no domain logic yet, just the package shape and docs.
- Cross-module access will later be via Go interfaces only — don't wire any cross-imports now.

## Definition of done
`cd backend && go build ./... && go test ./...` green; seven packages present with doc comments.

## Dependencies
S2 (Go module + cmd/api).

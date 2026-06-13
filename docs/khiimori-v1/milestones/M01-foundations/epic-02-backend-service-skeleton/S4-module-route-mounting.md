# S4 — Module route-mounting interface

> **Status:** ✅ Done.

## Context
The whole point of the modular monolith is that `/cmd/api` mounts **each module's routes through their
own interface**, with no module reaching into another's internals (PRD §7.1). This story defines that
contract and wires the (still empty) modules into the server from S3, so adding real endpoints later is
a one-line registration rather than surgery on `main`.

Assumes the server bootstrap (**S3**) and the `internal/{auth,trip,budget,journal,sharing,geo}` package
skeletons (M01.1) exist.

## Task
Define a route-registration interface in `platform` and have `/cmd/api` build the root router by mounting
every module through it.

## Acceptance criteria
- [x] A small interface (e.g. `RouteRegistrar` with `RegisterRoutes(r)` / `Mount(mux)`) lives in `platform`.
- [x] Each domain module exposes a constructor returning a value that satisfies the interface; routes may
  be empty for now (no handlers required yet).
- [x] `/cmd/api` assembles the root router by iterating the modules and mounting each — adding/removing a
  module is a single edit in the composition root, not scattered.
- [x] Cross-module imports stay clean: `main` depends on each module's public surface only; no module
  imports another module's internals (consistent with M01.1 boundary rules).
- [x] `go build ./...` and `go vet ./...` succeed with all modules mounted.

## Constraints
- Standard library router (`http.ServeMux`) is sufficient — no framework (PRD §7.0).
- Don't add health endpoints here (S7/S8) or real domain handlers — keep modules empty.

## Definition of done
The server from S3 boots with all modules mounted through the shared interface; build + vet are green.

## Dependencies
S3 (server bootstrap). Uses the module skeletons from M01.1.

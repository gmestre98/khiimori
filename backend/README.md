# backend

Go modular monolith (microservice-ready). Scaffolded across the stories of
[Epic M01.1](../docs/eudaimonia-v1/milestones/M01-foundations/epic-01-repo-scaffolding/README.md).

## Layout

- `cmd/api` — the service entrypoint (single binary).
- `internal/platform` — shared infra/cross-cutting helpers (config, logging, db handles). Not a domain module.
- `internal/{auth,trip,budget,journal,sharing,geo}` — domain modules, mirroring the target microservice boundaries.

## Module boundary rule

The monolith only stays peelable-into-services if modules don't reach into each
other's internals. The rule:

- A domain module under `internal/<module>` **must not** import another domain
  module's package directly.
- The shared `internal/platform` package **may** be imported by any module.
- Cross-module access happens via **Go interfaces only** (define the interface
  on the consumer side; wire concrete implementations together in `cmd/api`).

This is enforced automatically by an architecture test in
`internal/boundaries` (pure `go/parser`, no external tooling), so a forbidden
import fails the build:

```sh
cd backend && go test ./internal/boundaries/...
```

The test scans every `.go` file under `internal/` and fails on any cross-module
import; a companion test proves it actually catches a synthetic violation.

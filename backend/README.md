# backend

Go modular monolith (microservice-ready). Scaffolded across the stories of
[Epic M01.1](../docs/khiimori-v1/milestones/M01-foundations/epic-01-repo-scaffolding/README.md).

## Layout

- `cmd/api` — the service entrypoint (single binary).
- `cmd/migrate` — the database migration runner (goose).
- `internal/platform` — shared infra/cross-cutting helpers (config, logging, db handles). Not a domain module.
- `internal/{auth,trip,budget,journal,sharing,geo}` — domain modules, mirroring the target microservice boundaries.
- `migrations/` — schema-per-module SQL migrations.

## Database & migrations

The service connects to one Neon Postgres database (schema per module) and is a
hard startup dependency. To connect, run migrations, and find where secrets live,
see **[docs/database.md](docs/database.md)**. Day to day:

```sh
make migrate-up        # apply pending migrations (loads backend/.env if present)
make migrate-status    # show applied / pending
```

## Build, test, lint & format

Prerequisite: Go 1.23+. Lint also needs [`golangci-lint`](https://golangci-lint.run) 1.64+.

```sh
cd backend
go build ./...            # compile everything
go test ./...             # run tests (includes the boundary check below)
golangci-lint run ./...   # lint (config: .golangci.yml) — single lint command
gofmt -l .                # format check: prints files needing formatting (empty = clean)
gofmt -w .                # apply formatting
```

`.golangci.yml` is deliberately minimal: golangci-lint's default linters plus
`gofmt`/`goimports`. One linter/formatter for the language, no premature strictness.

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

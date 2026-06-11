# S6 — Go linter/formatter, runnable locally

## Context
Keep tooling minimal: **one** linter/formatter per language. This story sets up Go linting and
formatting so backend style is consistent and checkable before pushing, and so CI can reuse the same
commands later.

Assumes the Go module from **S2** (ideally the packages from S3) exists.

## Task
Configure a single Go linter/formatter with a committed config and documented local commands.

## Acceptance criteria
- [ ] One Go linter/formatter configured — `gofmt`/`goimports` for formatting plus `golangci-lint`
  with a committed `.golangci.yml` using a **minimal** ruleset.
- [ ] A documented single command lints the backend (e.g. `golangci-lint run ./...`) and passes on
  the current tree.
- [ ] A documented single command formats or checks formatting (e.g. `gofmt -l .` returns nothing).
- [ ] Commands documented in `backend/README.md`.

## Constraints
- Minimal ruleset — enable a sensible default set, not every linter. No premature strictness.
- If S4 (boundary enforcement) uses a linter rule like `depguard`, configure it here in the same
  `.golangci.yml` to avoid a second tool.

## Definition of done
Lint and format-check commands run clean on the current backend tree and are documented.

## Dependencies
S2 (Go module). Coordinates with S4 if boundary check is linter-based.

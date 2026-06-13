# S4 — Enforce module import boundaries

> **Status:** ✅ Done.

## Context
The modular monolith only stays peelable-into-services if modules don't reach into each other's
internals. The boundary rule: a module package under `backend/internal/<module>` must **not** import
another module's package directly; cross-module access happens via interfaces only. The shared
`platform` package may be imported by any module. This story makes that rule automated so it can't
silently rot.

Assumes the internal module packages from **S3** exist.

## Task
Add an automated check that fails when one module imports another module's package, runnable with a
single local command and ready to wire into CI later.

## Acceptance criteria
- [x] A check fails when `internal/<moduleA>` imports `internal/<moduleB>` directly (any module pair).
- [x] The shared `platform` package is allowed as an import from any module.
- [x] The check runs via one documented local command (e.g. a `golangci-lint` import-restriction rule
  such as `depguard`, or a Go architecture test using `go/packages`).
- [x] The check currently passes on the S3 tree, and demonstrably fails if a forbidden import is added
  (include a brief note or a skipped/negative test proving it catches violations).
- [x] A short note in `backend/README.md` explains the rule and the allowed path (via interfaces).

## Constraints
- Keep tooling minimal — prefer extending the existing linter over adding a new tool if one is
  already configured (see S6).
- The command must be CI-friendly (non-zero exit on violation).

## Definition of done
One command reports clean on the current tree and red when a cross-module import is introduced.

## Dependencies
S3 (module skeletons). Pairs naturally with S6 (Go linter) if using a linter-based rule.

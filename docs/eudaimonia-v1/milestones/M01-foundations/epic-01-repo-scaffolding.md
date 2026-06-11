# Epic M01.1 — Repository & Project Scaffolding

> Milestone: [01 — Foundations](README.md) · PRD refs: §7.0, §7.1, §7.3.

## Description

Create the single repository's skeleton: the monorepo layout, the Go modular-monolith package
structure with empty-but-real internal module boundaries, the React/TS web app, shared linting,
and a one-command local dev story. No behaviour yet — just the shape everything else fills in.

**Estimated effort:** ~2–3 developer-days (one developer).

## Acceptance Criteria

- [ ] Monorepo created with `/backend`, `/web`, `/infra`, `/scripts`, `.github/workflows` (PRD §7.0, §7.3).
- [ ] Go module initialised with `/cmd/api` and `internal/{platform,auth,trip,budget,journal,sharing,geo}`, each a compiling, independently-testable package that does **not** import another module's internals (PRD §7.1).
- [ ] React + TypeScript app (Vite) initialised and builds (`/web`).
- [ ] Linters/formatters configured for Go and TS and runnable locally.
- [ ] A documented **one command** brings up backend + web for local dev.

## Implementation Details / Architecture

- Layout mirrors PRD §7.1 module boundaries so a module can later be peeled into its own service
  without moving code around (modular-monolith-ready). Cross-module access is via Go interfaces only.
- TypeScript is the single language for web, scripts, and infra (PRD §7.3) — no extra runtimes.
- Keep tooling minimal (PRD §7.0): one linter/formatter per language, no premature frameworks.

## Dependencies

- **Upstream:** none (first epic of the project).
- **Downstream:** every other epic builds on this layout.

## Costs Impact

None — local scaffolding only.

## Designs

N/A (no UI).

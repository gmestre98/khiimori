# Epic M01.1 — Repository & Project Scaffolding

> **Status:** ✅ Done — all 9 stories implemented and all 5 acceptance criteria verified.
>
> Milestone: [01 — Foundations](../README.md) · PRD refs: §7.0, §7.1, §7.3.

## Description

Create the single repository's skeleton: the monorepo layout, the Go modular-monolith package
structure with empty-but-real internal module boundaries, the React/TS web app, shared linting,
and a one-command local dev story. No behaviour yet — just the shape everything else fills in.

**Estimated effort:** ~2–3 developer-days (one developer).

## Acceptance Criteria

- [x] Monorepo created with `/backend`, `/web`, `/infra`, `/scripts`, `.github/workflows` (PRD §7.0, §7.3).
- [x] Go module initialised with `/cmd/api` and `internal/{platform,auth,trip,budget,journal,sharing,geo}`, each a compiling, independently-testable package that does **not** import another module's internals (PRD §7.1).
- [x] React + TypeScript app (Vite) initialised and builds (`/web`).
- [x] Linters/formatters configured for Go and TS and runnable locally.
- [x] A documented **one command** brings up backend + web for local dev.

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

## User stories

The epic is split into **9 small user stories**, each sized **≤4h for one developer**
(implementation + tests + review). Each story file is a standalone agent-ready prompt — hand a
single file to a coding agent and it has enough context (background, task, acceptance criteria,
constraints, dependencies, definition of done) to implement it without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-monorepo-skeleton.md) | Monorepo skeleton & top-level layout | ~2h | AC1 | — |
| [S2](S2-go-module-cmd-api.md) | Go module + `/cmd/api` entrypoint that compiles | ~2h | AC2 | S1 |
| [S3](S3-internal-module-skeletons.md) | Internal module package skeletons | ~3h | AC2 | S2 |
| [S4](S4-enforce-module-boundaries.md) | Enforce module import boundaries | ~3h | AC2 | S3 |
| [S5](S5-web-app-vite.md) | React + TypeScript (Vite) web app that builds | ~2h | AC3 | S1 |
| [S6](S6-go-lint-format.md) | Go linter/formatter, runnable locally | ~2h | AC4 | S2 |
| [S7](S7-web-lint-format.md) | Web linter/formatter, runnable locally | ~2h | AC4 | S5 |
| [S8](S8-one-command-local-dev.md) | One-command local dev (backend + web) | ~3h | AC5 | S2, S5 |
| [S9](S9-document-local-dev.md) | Document the local dev story | ~1.5h | AC5 | S8 |

**Total:** ~20.5h (≈ 2.5–3 dev-days), consistent with the epic's ~2–3 dev-day estimate.

### Sequencing

```
S1 Monorepo skeleton
   ├─ S2 Go module + cmd/api ─┬─ S3 Module skeletons ── S4 Boundary enforcement
   │                          └─ S6 Go lint/format
   └─ S5 Web app (Vite) ───────── S7 Web lint/format
S8 One-command local dev  ◄── needs S2 + S5
   └─ S9 Document local dev story
```

S2 and S5 can run in parallel once S1 lands.

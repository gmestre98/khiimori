# Epic M01.1 — Agent-ready story files

One self-contained file per user story from
[epic-01-repo-scaffolding-stories.md](../epic-01-repo-scaffolding-stories.md). Each file is written
as a standalone prompt: hand a single file to a coding agent and it has enough context (background,
task, acceptance criteria, constraints, dependencies, definition of done) to implement it without
reading the rest of the docs.

Work them in dependency order:

| File | Story | Est. | Depends on |
|------|-------|------|-----------|
| [S1](S1-monorepo-skeleton.md) | Monorepo skeleton & top-level layout | ~2h | — |
| [S2](S2-go-module-cmd-api.md) | Go module + `/cmd/api` that compiles | ~2h | S1 |
| [S3](S3-internal-module-skeletons.md) | Internal module package skeletons | ~3h | S2 |
| [S4](S4-enforce-module-boundaries.md) | Enforce module import boundaries | ~3h | S3 |
| [S5](S5-web-app-vite.md) | React + TS (Vite) app that builds | ~2h | S1 |
| [S6](S6-go-lint-format.md) | Go linter/formatter, local | ~2h | S2 |
| [S7](S7-web-lint-format.md) | Web linter/formatter, local | ~2h | S5 |
| [S8](S8-one-command-local-dev.md) | One-command local dev (backend + web) | ~3h | S2, S5 |
| [S9](S9-document-local-dev.md) | Document the local dev story | ~1.5h | S8 |

S2 and S5 can run in parallel once S1 lands.

# Epic M01.1 — Repository & Project Scaffolding — User Stories

> Parent epic: [epic-01-repo-scaffolding.md](epic-01-repo-scaffolding.md) · Milestone: [01 — Foundations](README.md)
> · PRD refs: §7.0, §7.1, §7.3.

The epic is split into **9 small user stories**, each sized **≤4h for one developer** (implementation
+ tests + review). Each story has its own self-contained file in
[`epic-01-stories/`](epic-01-stories/) — full context, acceptance criteria, constraints, and
definition of done live there, not here.

| # | Story | Est. | Epic AC |
|---|-------|------|---------|
| [S1](epic-01-stories/S1-monorepo-skeleton.md) | Monorepo skeleton & top-level layout | ~2h | AC1 |
| [S2](epic-01-stories/S2-go-module-cmd-api.md) | Go module + `/cmd/api` entrypoint that compiles | ~2h | AC2 |
| [S3](epic-01-stories/S3-internal-module-skeletons.md) | Internal module package skeletons | ~3h | AC2 |
| [S4](epic-01-stories/S4-enforce-module-boundaries.md) | Enforce module import boundaries | ~3h | AC2 |
| [S5](epic-01-stories/S5-web-app-vite.md) | React + TypeScript (Vite) web app that builds | ~2h | AC3 |
| [S6](epic-01-stories/S6-go-lint-format.md) | Go linter/formatter, runnable locally | ~2h | AC4 |
| [S7](epic-01-stories/S7-web-lint-format.md) | Web linter/formatter, runnable locally | ~2h | AC4 |
| [S8](epic-01-stories/S8-one-command-local-dev.md) | One-command local dev (backend + web) | ~3h | AC5 |
| [S9](epic-01-stories/S9-document-local-dev.md) | Document the local dev story | ~1.5h | AC5 |

**Total:** ~20.5h (≈ 2.5–3 dev-days), consistent with the epic's ~2–3 dev-day estimate.

## Sequencing

```
S1 Monorepo skeleton
   ├─ S2 Go module + cmd/api ─┬─ S3 Module skeletons ── S4 Boundary enforcement
   │                          └─ S6 Go lint/format
   └─ S5 Web app (Vite) ───────── S7 Web lint/format
S8 One-command local dev  ◄── needs S2 + S5
   └─ S9 Document local dev story
```

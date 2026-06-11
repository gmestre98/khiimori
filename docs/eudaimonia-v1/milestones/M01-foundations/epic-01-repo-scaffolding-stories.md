# Epic M01.1 — Repository & Project Scaffolding — User Stories

> Parent epic: [epic-01-repo-scaffolding.md](epic-01-repo-scaffolding.md) · Milestone: [01 — Foundations](README.md)
> · PRD refs: §7.0, §7.1, §7.3.

Breakdown of the epic into small, independently-shippable user stories. **Each story is sized at
≤4h for one developer** (implementation + tests + review). Stories are ordered to respect their
dependencies; S2 and S5 can be picked up in parallel once S1 lands.

Persona note: the "developer" in these stories is any contributor to the codebase (the author in v1).

| # | Story | Est. | Covers epic AC |
|---|-------|------|----------------|
| S1 | Monorepo skeleton & top-level layout | ~2h | AC1 |
| S2 | Go module + `/cmd/api` entrypoint that compiles | ~2h | AC2 |
| S3 | Internal module package skeletons | ~3h | AC2 |
| S4 | Enforce module import boundaries | ~3h | AC2 |
| S5 | React + TypeScript (Vite) web app that builds | ~2h | AC3 |
| S6 | Go linter/formatter, runnable locally | ~2h | AC4 |
| S7 | Web linter/formatter, runnable locally | ~2h | AC4 |
| S8 | One-command local dev (backend + web) | ~3h | AC5 |
| S9 | Document the local dev story | ~1.5h | AC5 |

**Total:** ~20.5h (≈ 2.5–3 dev-days), consistent with the epic's ~2–3 dev-day estimate.

---

## S1 — Monorepo skeleton & top-level layout

**As a** developer joining the project,
**I want** the repository to have its top-level directory layout in place,
**so that** every later piece of work has an obvious, agreed home and the repo shape matches the PRD.

**Acceptance criteria**
- [ ] Top-level directories exist and are tracked: `/backend`, `/web`, `/infra`, `/scripts`,
  `.github/workflows` (PRD §7.0, §7.3).
- [ ] Each directory has a placeholder (`.gitkeep` or a short `README.md`) so it is committed even
  while empty.
- [ ] Root `.gitignore` and `.editorconfig` cover Go, Node/TS, and OS/editor noise.
- [ ] Root `README.md` states the monorepo intent and links to the docs folder.

**Dependencies:** none (first story).
**Estimate:** ~2h.

---

## S2 — Go module + `/cmd/api` entrypoint that compiles

**As a** backend developer,
**I want** an initialised Go module with a minimal `/cmd/api` entrypoint,
**so that** there is a real, compiling backend binary to build everything else on.

**Acceptance criteria**
- [ ] `go.mod` initialised under `/backend` with the agreed module path and a pinned Go version.
- [ ] `/cmd/api/main.go` exists and `go build ./...` succeeds from `/backend`.
- [ ] `go vet ./...` and `go test ./...` run clean (no packages / trivially passing).
- [ ] No behaviour beyond process start — entrypoint is intentionally empty (PRD §7.1).

**Dependencies:** S1.
**Estimate:** ~2h.

---

## S3 — Internal module package skeletons

**As a** backend developer,
**I want** each domain module to exist as its own empty-but-real Go package,
**so that** the modular-monolith boundaries from the PRD are physically present from day one.

**Acceptance criteria**
- [ ] Packages created under `internal/`: `platform`, `auth`, `trip`, `budget`, `journal`,
  `sharing`, `geo` (PRD §7.1).
- [ ] Each package compiles independently and has a trivially-passing `_test.go` so it is
  independently testable.
- [ ] Each package has a short doc comment stating its domain responsibility (mirrors PRD §7.1
  boundaries).
- [ ] No cross-module imports introduced (formally enforced in S4).

**Dependencies:** S2.
**Estimate:** ~3h.

---

## S4 — Enforce module import boundaries

**As a** maintainer,
**I want** an automated check that no module imports another module's internals,
**so that** the clean boundaries can't silently rot and modules stay peelable into services later.

**Acceptance criteria**
- [ ] A check fails when a module package imports another module's package directly
  (e.g. import-restriction linter rule or a Go architecture test).
- [ ] Cross-module access is permitted only via interfaces (the rule documents the allowed path).
- [ ] The check runs with a single local command and is wired to fail CI later (PRD §7.1).
- [ ] A short note in the backend README explains the rule and how to satisfy it.

**Dependencies:** S3.
**Estimate:** ~3h.

---

## S5 — React + TypeScript (Vite) web app that builds

**As a** frontend developer,
**I want** a Vite-based React + TypeScript app scaffolded under `/web`,
**so that** there is a real web app that builds, ready for the app shell in a later epic.

**Acceptance criteria**
- [ ] `/web` initialised with Vite + React + TypeScript; `npm install` succeeds.
- [ ] `npm run build` produces a production bundle with no type errors.
- [ ] `npm run dev` serves the default page locally.
- [ ] TypeScript is the only language used (no extra runtimes) (PRD §7.3).

**Dependencies:** S1 (parallel with S2–S4).
**Estimate:** ~2h.

---

## S6 — Go linter/formatter, runnable locally

**As a** backend developer,
**I want** a single configured linter/formatter for Go,
**so that** backend code style is consistent and checkable before pushing.

**Acceptance criteria**
- [ ] One Go linter/formatter configured (e.g. `gofmt`/`goimports` + `golangci-lint`) with a
  committed config — minimal ruleset (PRD §7.0).
- [ ] A documented single command lints the backend; it passes on the current tree.
- [ ] A documented single command formats (or checks formatting of) the backend.

**Dependencies:** S2.
**Estimate:** ~2h.

---

## S7 — Web linter/formatter, runnable locally

**As a** frontend developer,
**I want** a single configured linter/formatter for the web app,
**so that** TS/React code style is consistent and checkable before pushing.

**Acceptance criteria**
- [ ] One TS linter + formatter configured (e.g. ESLint + Prettier) with committed config.
- [ ] `npm run lint` and `npm run format` (or check) are defined and pass on the current tree.
- [ ] Config is minimal and shared-friendly (no premature framework rules) (PRD §7.0).

**Dependencies:** S5.
**Estimate:** ~2h.

---

## S8 — One-command local dev (backend + web)

**As a** developer,
**I want** a single command that brings up the backend and the web app together,
**so that** anyone can start the whole stack locally without memorising steps.

**Acceptance criteria**
- [ ] One command (e.g. `make dev` / Taskfile / `scripts/dev.ts`) starts backend + web together.
- [ ] Tooling is TypeScript/standard where a runtime is needed — no new languages (PRD §7.3).
- [ ] Command fails clearly with actionable output if a prerequisite is missing.
- [ ] Verified on a clean checkout: both processes come up and the web app reaches the backend.

**Dependencies:** S2, S5 (uses both; benefits from S6/S7).
**Estimate:** ~3h.

---

## S9 — Document the local dev story

**As a** new contributor,
**I want** the one-command local dev story written down,
**so that** I can go from clone to running stack by following the README.

**Acceptance criteria**
- [ ] Root and/or `/backend` + `/web` READMEs document prerequisites and the one-command startup.
- [ ] Lint/format/test commands for both languages are listed.
- [ ] Steps verified by following them on a fresh clone.

**Dependencies:** S8 (and references S6, S7).
**Estimate:** ~1.5h.

---

## Sequencing

```
S1 Monorepo skeleton
   ├─ S2 Go module + cmd/api ─┬─ S3 Module skeletons ── S4 Boundary enforcement
   │                          └─ S6 Go lint/format
   └─ S5 Web app (Vite) ───────── S7 Web lint/format
S8 One-command local dev  ◄── needs S2 + S5
   └─ S9 Document local dev story
```

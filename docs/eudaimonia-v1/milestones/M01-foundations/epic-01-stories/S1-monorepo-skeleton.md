# S1 — Monorepo skeleton & top-level layout

## Context
Eudaimonia is a personal travel-manager app. The stack is deliberately small: **Go** backend
(modular monolith), **React + TypeScript** (Vite) web app, **TypeScript** for scripts and infra
(Pulumi/GCP). This is the very first piece of work — the repo currently only holds `docs/`.
Guiding principle: keep the stack small and every decision easy to reverse.

## Task
Create the top-level monorepo directory layout so every later piece of work has an obvious home.
No application behaviour — just the repo shape.

## Acceptance criteria
- [ ] These top-level directories exist and are tracked by git: `/backend`, `/web`, `/infra`,
  `/scripts`, `.github/workflows`.
- [ ] Each empty directory has a placeholder (`.gitkeep` or a one-line `README.md`) so it commits.
- [ ] Root `.gitignore` covers Go build output, Node/`node_modules`, build dirs, and OS/editor noise
  (`.DS_Store`, `.idea/`, `.vscode/`).
- [ ] Root `.editorconfig` sets sane defaults (UTF-8, LF, final newline, 2-space for TS/JSON/YAML,
  tabs for Go).
- [ ] Root `README.md` states the monorepo intent and links to `docs/eudaimonia-v1/`.

## Constraints
- Don't scaffold the Go module or web app yet — those are separate stories (S2, S5).
- Keep it minimal; no tooling or frameworks here.

## Definition of done
`git status` shows all five paths tracked; repo builds nothing but is cleanly laid out.

## Dependencies
None — this is the first story.

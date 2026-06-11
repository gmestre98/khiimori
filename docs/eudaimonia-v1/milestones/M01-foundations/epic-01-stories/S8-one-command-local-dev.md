# S8 — One-command local dev (backend + web)

## Context
A new contributor (the author, in v1) should go from clone to a running stack with **one command**.
This story wires up that command to start the Go backend and the Vite web app together. Tooling
should stay in the existing languages — prefer a `Makefile`/`Taskfile` or a TypeScript script in
`/scripts` over introducing a new runtime.

Assumes the Go backend (**S2**) and the web app (**S5**) exist and run individually.

## Task
Provide a single documented command that brings up backend + web together for local development.

## Acceptance criteria
- [ ] One command starts both processes together — e.g. `make dev`, a `Taskfile`, or
  `scripts/dev.ts` (TypeScript, per the one-language-for-scripting rule).
- [ ] No new languages/runtimes introduced beyond Go + the Node toolchain already present.
- [ ] If a prerequisite is missing (Go, Node, ports in use), the command fails with clear, actionable
  output instead of a cryptic error.
- [ ] Verified on a clean checkout: both processes come up and the web app can reach the backend
  (a trivial reachability check is fine; full health endpoints come in a later epic).

## Constraints
- Keep it minimal and OS-friendly (works on macOS/Linux). No docker-compose unless trivially needed.
- Don't add new backend HTTP behaviour just to prove reachability — keep the check lightweight.

## Definition of done
Fresh clone + the one command → backend and web both running, web reaches backend.

## Dependencies
S2 (backend) and S5 (web). Benefits from S6/S7 being present.

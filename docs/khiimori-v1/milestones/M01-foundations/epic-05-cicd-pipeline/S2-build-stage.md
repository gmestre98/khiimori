# S2 — Build stage (service binary + web bundle)

## Context
After lint/unit, the pipeline must **build** both artifacts to catch compile/bundle breakage before deploy
(PRD §7.5). This story adds a build stage that compiles the Go service and produces the web production
bundle, gating the change on a clean build.

Assumes the base CI workflow (**S1**) and buildable backend/web (M01.1/M01.2) exist.

## Task
Add a build stage to CI that compiles the Go service and builds the web app.

## Acceptance criteria
- [ ] CI runs `go build ./...` (and `go vet`) for the backend and the web production build (e.g. `vite build`).
- [ ] The build stage runs after lint/unit and **fails the check** on any compile/bundle error.
- [ ] Build artifacts (or their absence on failure) are observable in the run; caching reused from S1.
- [ ] No deploy/push here — purely proving both build (containerisation is S3).

## Constraints
- Keep it minimal and fast; reuse caches from S1 (PRD §8.4 #4 — CI minutes).
- Don't duplicate the unit-test run; this stage is about buildability.

## Definition of done
A PR that breaks the Go build or the web bundle fails CI at the build stage.

## Dependencies
S1 (base workflow). Precedes S3 (containerise) and S8 (web deploy).

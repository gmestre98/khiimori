# S3 — CORS between Hosting origin and Cloud Run API

## Context
The web app (Firebase Hosting origin) and the API (Cloud Run origin) are on **different origins**, so the
browser's `/healthz` call (S2) only works if the API sends correct **CORS** headers (epic AC3). This story
adds CORS handling to the API, scoped to the Hosting origin(s), driven by config.

Assumes the API server + middleware (M01.2) and the Hosting origin (M01.4 S8) exist.

## Task
Add configurable CORS handling to the API allowing the Firebase Hosting origin.

## Acceptance criteria
- [ ] The API responds with correct CORS headers for the **Hosting origin**, including preflight (`OPTIONS`).
- [ ] Allowed origin(s) come from **config/env** (local dev origin + the Hosting origin) — not a wildcard `*` in prod (PRD §6).
- [ ] Implemented as `platform` HTTP middleware (M01.2 S5 chain), consistent with the rest of the stack.
- [ ] Unit test asserts allowed-origin requests get CORS headers and a disallowed origin does not.
- [ ] Documented which origins are allowed and how to add one.

## Constraints
- **Standard library only** (`net/http`); no CORS framework — ask first if you think one is needed (project rule).
- No wildcard origins in production; least-privilege origins (PRD §6).

## Definition of done
The deployed web app's `/healthz` call succeeds cross-origin; a disallowed origin is rejected; test green.

## Dependencies
M01.2 (server + middleware), M01.4 S8 (Hosting origin). Required for S2's call to work in S4.

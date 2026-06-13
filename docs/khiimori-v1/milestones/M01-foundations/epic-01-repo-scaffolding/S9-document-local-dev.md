# S9 — Document the local dev story

> **Status:** ✅ Done.

## Context
The scaffolding is only useful if a contributor can go from clone to running stack by following the
docs. This story writes down the prerequisites, the one-command startup, and the per-language
lint/format/test commands produced by the earlier stories.

Assumes S6, S7, and especially **S8** (the one-command dev flow) are in place.

## Task
Document the local development story in the README(s) and verify it on a fresh clone.

## Acceptance criteria
- [x] Root `README.md` (and/or `backend/README.md` + `web/README.md`) documents prerequisites
  (Go version, Node version) and the **one-command** startup from S8.
- [x] Lint, format, and test commands for both Go and the web app are listed.
- [x] A short "from clone to running" section is included.
- [x] Steps verified by following them on a fresh clone (note in the PR that this was done).

## Constraints
- Documentation only — don't change code or tooling here; if a documented command doesn't work,
  fix the doc to match reality (or flag the gap), not the tooling.

## Definition of done
A reader can clone, follow the README, and reach a running stack without external knowledge.

## Dependencies
S8 (one-command dev); references S6 and S7.

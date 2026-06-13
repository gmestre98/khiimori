# S1 — Minimal app shell with environment-driven API base URL

> **Status:** ✅ Done — minimal shell + env-driven API client (`VITE_API_BASE_URL`), no hardcoded prod URL ([#133](https://github.com/gmestre98/khiimori/pull/133)).

## Context
Milestone 01 ships only a **minimal React/TS app shell** — real screens and theming come in Milestone 09
(PRD §7.2). The one thing that matters now is that the app knows how to reach the API via an
**environment-driven base URL** (no hardcoded prod URL), so the same build works locally and in production
(epic AC4).

Assumes the Vite React/TS app from M01.1 S5 exists.

## Task
Build a minimal app shell and wire an environment-driven API base URL into a small API client.

## Acceptance criteria
- [x] A minimal shell renders (app title/layout placeholder) — no real feature screens (those are Milestone 09).
- [x] The API base URL is read from a **build-time env var** (e.g. `VITE_API_BASE_URL`), with a documented local default.
- [x] A tiny typed API helper centralises the base URL (one place to change), used by S2's health view.
- [x] **No hardcoded production URL** anywhere in the source (epic AC4).
- [x] `.env.example` (or equivalent) documents the variable; real values are not committed.

## Constraints
- Keep it minimal (PRD §7.0, §7.2) — no design system/PWA yet (Milestone 09).
- Reuse the existing web toolchain; don't add a state/data library just for this.

## Definition of done
The shell builds and runs locally reading the API base URL from env, with no hardcoded prod URL in source.

## Dependencies
M01.1 S5 (Vite app). Precedes S2 (health view) and feeds S4 (deploy).

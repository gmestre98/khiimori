# S5 — React + TypeScript (Vite) web app that builds

> **Status:** ✅ Done.

## Context
The web app and future mobile (PWA) experience share one **React + TypeScript** codebase, built with
**Vite**. This story scaffolds that app so there's a real thing that builds — the app shell and
product UI come in later epics. The visual theme will be minimal black & white, but no styling work
is needed here.

Assumes the monorepo layout from **S1** exists (`/web` directory present).

## Task
Scaffold a Vite + React + TypeScript app under `/web` that installs, builds, and serves.

## Acceptance criteria
- [x] `/web` initialised with Vite + React + TypeScript; `npm install` succeeds.
- [x] `npm run build` produces a production bundle with **no type errors**.
- [x] `npm run dev` serves the default page locally.
- [x] TypeScript only — no extra languages/runtimes added.

## Constraints
- Keep it to the stock Vite React-TS template plus what's needed to build; no UI framework,
  router, or state library yet (those are later decisions).
- Don't configure linting/formatting here — that's S7.

## Definition of done
`cd web && npm install && npm run build` succeeds; `npm run dev` serves a page.

## Dependencies
S1 (monorepo skeleton). Can run in parallel with S2–S4.

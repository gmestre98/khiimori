# S7 — Web linter/formatter, runnable locally

> **Status:** ✅ Done.

## Context
Keep tooling minimal: one linter + one formatter for the web app, so TS/React style is consistent and
checkable before pushing, and CI can reuse the same commands. Black/white theming and component
choices come later — this is purely tooling.

Assumes the Vite React-TS app from **S5** exists under `/web`.

## Task
Configure ESLint + Prettier for `/web` with committed config and documented npm scripts.

## Acceptance criteria
- [x] ESLint configured for TypeScript + React with a committed config.
- [x] Prettier configured with a committed config; ESLint and Prettier don't fight (formatting rules
  deferred to Prettier).
- [x] `npm run lint` and `npm run format` (or `format:check`) are defined in `web/package.json` and
  pass on the current tree.
- [x] Config is minimal — no premature framework/style rules.

## Constraints
- One linter + one formatter only; don't add extra plugins beyond TS + React essentials.
- Don't touch the build config from S5 beyond what linting requires.

## Definition of done
`cd web && npm run lint && npm run format:check` pass on the current tree.

## Dependencies
S5 (web app scaffold).

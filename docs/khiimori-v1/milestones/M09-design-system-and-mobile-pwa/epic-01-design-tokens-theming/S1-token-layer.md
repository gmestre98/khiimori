# S1 — Design token layer

## Context
**Design tokens** — colours, typography, spacing — drive the whole app and make theming a single-place
change (PRD §5.10, §7.2). This story builds the token layer in the `/web` app.

## Task
Implement a token layer (CSS variables / lightweight token module) for colours, typography, and spacing.

## Acceptance criteria
- [x] Tokens define the **colour**, **typography**, and **spacing** scales the app uses, exposed via CSS
  variables (or an equivalent lightweight layer).
- [x] Components/screens reference tokens, not hardcoded values (the convention is established here).
- [x] Changing a token value updates the app consistently (single source of truth).
- [x] The token layer has a small footprint (no heavy framework, PRD §7.0).

## Constraints
- Favour platform CSS variables / a thin layer over a heavy theming dependency — confirm any new
  dependency with the author (project rule).
- Tokens are the substrate for Epic 02's components — design them against real needs.

## Definition of done
A token layer for colours/type/spacing exists; the app references tokens rather than hardcoded values.

## Dependencies
M01.6 (web shell). Consumed by Epic 02 and every feature screen.

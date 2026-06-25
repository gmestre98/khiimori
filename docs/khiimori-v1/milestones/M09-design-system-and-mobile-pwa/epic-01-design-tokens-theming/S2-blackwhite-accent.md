# S2 — Black/white theme & restrained accent

## Context
The default theme is **minimal black & white** with a **single configurable accent** reserved for status,
budget bars, and map pins (PRD §5.10). Re-skinning must be a token change.

## Task
Define the black/white theme and the single-accent convention on top of the token layer.

## Acceptance criteria
- [x] The default theme renders **black & white** using the tokens (S1).
- [x] A **single accent** colour token exists, applied only to the sanctioned cases: **status, budget
  bars, map pins**.
- [x] Re-skinning (palette/typography) is achievable by editing tokens in one place (verify by swapping
  the accent and confirming it flows through).
- [x] Accent is restrained by design — there is a clear convention/utility so feature code applies it only
  where sanctioned.

## Constraints
- Keep accent usage restrained (PRD §5.10) — make the "right" usage the easy path.
- The theme must be cheap to evolve post-v1 (PRD §5.10 "designed to evolve").

## Definition of done
A token-driven black/white theme with a single restrained accent exists and is re-skinnable in one place.

## Dependencies
S1 (tokens). Consumed by Epic 02 (components), Milestone 05 (budget bars), Milestone 07 (pins).

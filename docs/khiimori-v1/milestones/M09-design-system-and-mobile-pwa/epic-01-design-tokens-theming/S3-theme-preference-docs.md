# S3 — Theme preference application & token docs

## Context
The theme respects the user's **theme preference** (from the Milestone 02 profile `prefs`) where
applicable, with a default defined, and tokens are **documented** so feature epics use them instead of
hardcoded values (PRD §5.10).

## Task
Apply the user's theme preference and document the token system.

## Acceptance criteria
- [x] The app reads the user's **theme preference** (Milestone 02 profile) and applies it; a sensible
  **default** is defined when none is set.
- [x] Changing the preference (via the profile screen, M02 Epic 05) updates the app's theme.
- [x] The tokens and the accent convention are **documented** (usage guide) so Epics 02–08 consume them.
- [x] The docs state the re-skinning process (edit tokens in one place).

## Constraints
- Theme preference plumbing connects to Milestone 02's `prefs` — do not store it only in local state.
- Keep the docs concise and accurate to the implementation.

## Definition of done
User theme preference is honoured with a default, and the token system is documented for reuse.

## Dependencies
S1, S2, Milestone 02 (profile `prefs`). Consumed by all feature screens.

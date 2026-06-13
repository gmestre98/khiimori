# S3 — EUR read-only enforcement (server-side)

## Context
Currency is displayed as **EUR** and is **not editable** in v1 — a forward-compatible field with no UI
(PRD §5.7, §9, §11.5). Enforcement must be **server-side** (the field is read-only at the API boundary,
not just hidden in the UI).

## Task
Ensure `default_currency` is always returned as EUR and cannot be changed via the profile edit endpoint.

## Acceptance criteria
- [ ] `default_currency` is returned as **`EUR`** from the read endpoint (S1).
- [ ] Any attempt to set/change `default_currency` via the edit endpoint (S2) is **rejected or ignored**
  server-side — the value stays EUR.
- [ ] A unit test asserts that a client payload trying to change currency does not alter it.

## Constraints
- Enforce at the API boundary, not just the UI (PRD §5.7) — a crafted request must not change currency.
- Keep the field present (forward-compatible) — do not remove it from the model/response.

## Definition of done
Currency is always EUR and immutable via the API; the tamper test is green.

## Dependencies
S1, S2. Satisfies the EUR-fixed acceptance criterion.

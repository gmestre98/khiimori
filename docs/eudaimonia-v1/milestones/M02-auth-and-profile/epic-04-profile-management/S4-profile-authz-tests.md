# S4 — Own-row authorization & profile tests

## Context
All profile reads/writes require a valid session and must only ever touch the **authenticated user's own
row** (PRD §6). This story hardens that guarantee and adds the epic's test coverage.

## Task
Verify and test that profile endpoints operate strictly on the session user's own row.

## Acceptance criteria
- [ ] Profile read/edit derive the user id **only** from the session; no client-supplied id can target
  another user's row.
- [ ] An unauthenticated request to the profile endpoints yields `401` (via Epic 03 middleware).
- [ ] Integration/unit tests cover: read own profile, edit own profile, currency-immutability, and that a
  request cannot read/edit a different user's profile.
- [ ] Tests run against the auth middleware so the session-derivation is exercised, not bypassed.

## Constraints
- Reuse Epic 03's middleware and Epic 02's repository; do not add a parallel auth path.
- Keep tests hermetic (test session + test DB/repo).

## Definition of done
Profile endpoints provably act only on the session user's row; the test suite (read/edit/currency/
isolation) is green.

## Dependencies
S1–S3, Epic 03 (middleware). Closes the epic's quality bar.

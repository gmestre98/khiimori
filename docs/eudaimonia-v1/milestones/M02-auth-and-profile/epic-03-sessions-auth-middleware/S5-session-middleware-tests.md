# S5 — Session & middleware tests

## Context
Epic AC5 requires unit + integration tests covering valid/expired/missing sessions, the `401` path, and
sign-out (PRD §7.6). The auth middleware gates the whole app, so it gets thorough coverage.

## Task
Add tests for session issuance, validation middleware, the 401 path, and sign-out.

## Acceptance criteria
- [ ] A **valid** session passes the middleware and the protected handler runs with the user attached.
- [ ] An **expired** session is rejected with `401`.
- [ ] A **missing** credential is rejected with `401`.
- [ ] After **sign-out**, the prior credential is rejected with `401`.
- [ ] Tests cover both unit (middleware in isolation) and an integration path (issue → call protected
  route → sign out → call again).

## Constraints
- Drive tests through the public middleware/endpoints, not internal helpers, so the contract is verified.
- No real Secret Manager dependency in tests — inject a test key via config.

## Definition of done
All four credential states plus sign-out are covered by green tests at unit and integration levels.

## Dependencies
S1–S4. Satisfies epic AC5.

# S2 — Auth middleware: validate session, attach user, 401

## Context
Every protected request must be authenticated by **shared middleware** that validates the session and
exposes the authenticated user to handlers; it is the single hook every other module uses (PRD §7.1).
Missing or expired credentials yield `401` (PRD §6). Builds on S1's issuer/interface and integrates with
M01.2's middleware chain.

## Task
Implement auth middleware that validates the session, attaches the user to the request context, and
returns `401` when invalid.

## Acceptance criteria
- [ ] Middleware validates the incoming session credential on each request using the S1 interface.
- [ ] On success it **attaches the authenticated user** (e.g. id) to the request context for handlers.
- [ ] On **missing or expired** credentials it returns **`401`** and does not run the protected handler.
- [ ] The middleware integrates with M01.2's HTTP middleware chain and is reusable by every module's
  routes.
- [ ] A unit test covers valid → handler runs with user, and missing/expired → 401.

## Constraints
- The middleware establishes **authentication only** (who you are); **trip authorization** is layered on
  top by Milestone 08 and consumes the user attached here (PRD §5.9) — do not add authz logic.
- No per-route duplication; expose one middleware other modules wrap with.

## Definition of done
Protected routes require a valid session via shared middleware; invalid → 401; the user is available to
handlers; tests green.

## Dependencies
S1, M01.2 (middleware chain). Consumed by every protected endpoint in Milestones 03–10; tests in S5.

# S5 — Key-never-leaks & proxy-boundary tests

## Context
Epic AC5 requires tests proving **the key never leaks** to client-visible responses and the proxy boundary
holds (provider faked) (PRD §7.6, §8.5). Key protection is safety-critical.

## Task
Add tests asserting the Maps key never reaches client-visible output and the proxy boundary is enforced.

## Acceptance criteria
- [x] A test asserts the Maps API key (and any privileged token) **never appears** in proxy responses,
  logs, or errors.
- [x] A test asserts client-facing endpoints go through the proxy/provider interface (provider faked) and
  cannot be made to return the key.
- [x] A test covers that a referer-locked client key, if used (S4), is the restricted key — or that no
  client key is shipped at all.
- [x] Tests run without live Google calls (provider mocked).

## Constraints
- Treat any key exposure as a failing test (release-blocking).
- Mock the provider/network; no live Maps calls in CI.

## Definition of done
Key-non-leakage and the proxy boundary are proven by green tests; no live calls needed.

## Dependencies
S2, S3, S4. Satisfies epic AC5; re-verified in Milestone 10.

# S4 — Client map-data brokering approach

## Context
If any client-side Maps SDK use is unavoidable, it must use a **restricted, referer-locked key or proxied
tiles** — the chosen approach documented, defaulting to maximum key protection (PRD §8.5). v1 needs only
pins + an indicative route, so keep it simple.

## Task
Decide and document how the client renders maps without holding a privileged key, and provide the
brokering the frontend (Epic 03) needs.

## Acceptance criteria
- [ ] A documented decision describes how the client renders the map: **proxied tiles/data** (preferred)
  or a **restricted referer-locked key** — defaulting to maximum key protection.
- [ ] The backend provides the data/endpoints the frontend (Epic 03) needs to render pins + an indicative
  route without a privileged key.
- [ ] If a referer-locked client key is used, it is the **restricted** key and the restriction is
  documented (and verified in Milestone 10).
- [ ] The approach keeps the proxy/cost protections intact (no path that bypasses the proxy for billable
  calls).

## Constraints
- Default to **maximum key protection** (PRD §8.5); justify any client-side key use explicitly.
- Keep v1 minimal (pins + route) — no advanced client SDK features (PRD §7.0).

## Definition of done
The client map-rendering approach is documented and the backend exposes the brokering Epic 03 needs,
without leaking a privileged key.

## Dependencies
S2, S3. Consumed by Epic 03 (rendering); verified in Milestone 10.

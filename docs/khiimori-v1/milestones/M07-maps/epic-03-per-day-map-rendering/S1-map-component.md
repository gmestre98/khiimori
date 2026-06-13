# S1 — Map component (proxy data, lazy-loaded, no client key)

## Context
The per-day map renders from **Geo proxy** data/tiles — the client holds **no Maps key** — and is
**lazy-loaded** to protect performance and cost (PRD §5.6, §8.4, §5.10). Renders inside Milestone 04's day
view.

## Task
Build a reusable map component that loads via the proxy and lazy-loads.

## Acceptance criteria
- [ ] A map component renders using data/tiles brokered by the **Geo proxy** (Epic 01 S4 approach); it
  holds **no privileged Maps key**.
- [ ] The map is **lazy-loaded** (loaded when the day view needs it), not on initial app load (PRD §6,
  §8.4 #2).
- [ ] The component fits the day view layout and is responsive (web + mobile).
- [ ] Loading/error states are handled (map unavailable degrades gracefully).

## Constraints
- No client-side privileged key (PRD §8.5) — follow Epic 01 S4's documented brokering approach.
- Lazy-load to hit Milestone 09's performance budget and avoid unnecessary Maps calls.

## Definition of done
A lazy-loaded map component renders via the proxy with no client key, inside the day view.

## Dependencies
Epic 01 S4 (brokering), M04 Epic 05 (day view). Pins in S2.

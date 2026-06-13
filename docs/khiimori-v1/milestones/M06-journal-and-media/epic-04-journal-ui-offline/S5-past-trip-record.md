# S5 — Past-trip journals as a permanent record

## Context
**Past-trip journals remain accessible** as a permanent record (PRD §5.5). A finished trip's journals and
photos stay readable.

## Task
Ensure journals/photos on past (and archived) trips remain accessible read-only as appropriate.

## Acceptance criteria
- [ ] Journals and photos on **past trips** (Past bucket from Milestone 03) remain **accessible** in the
  UI.
- [ ] Access still passes the trip `Authorizer` (owner + invited members only).
- [ ] The past-trip journal view is read-friendly (a record), consistent with the editor for current
  trips.
- [ ] Archived trips' journals are reachable from the archived/past context.

## Constraints
- No special data handling needed — past is derived from dates (Milestone 03); this is a UI/access
  guarantee.
- Respect authorization and privacy on past trips exactly as on current ones.

## Definition of done
Past-trip journals and photos remain accessible (authorized) as a permanent record.

## Dependencies
S1, S2, Milestone 03 (Past bucket), M03 Epic 04 (authz).

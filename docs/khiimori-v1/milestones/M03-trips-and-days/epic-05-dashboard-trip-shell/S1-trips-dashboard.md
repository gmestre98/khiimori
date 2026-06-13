# S1 — Trips dashboard (Current/Upcoming/Past)

## Context
The web app needs a **Trips dashboard** rendering the **Current / Upcoming / Past** buckets from the
listing endpoint (Epic 03 S2), inside the authenticated, gated app (Milestone 02) (PRD §5.1). This is the
navigation spine feature milestones render inside.

## Task
Build the Trips dashboard that fetches and renders the bucketed trips.

## Acceptance criteria
- [ ] The dashboard calls `GET /trips` (Epic 03) and renders **Current / Upcoming / Past** sections.
- [ ] Trip cards show name, destinations, dates, and cover; only **authorized** trips appear (server-scoped
  — the client does not filter).
- [ ] Empty states are handled (e.g. no upcoming trips).
- [ ] The dashboard is responsive (web + mobile) with basic styling now; Milestone 09 components later.

## Constraints
- Render server-decided buckets/scoping; do not bucket or authorize client-side (PRD §5.1, §5.9).
- Use the M01.6 web shell and Milestone 02 auth context.

## Definition of done
A signed-in user sees their trips grouped into Current/Upcoming/Past on a responsive dashboard.

## Dependencies
Milestone 02 (gated app), Epic 03 S2 (listing). Current-trip surface in S2; create/edit in S3.

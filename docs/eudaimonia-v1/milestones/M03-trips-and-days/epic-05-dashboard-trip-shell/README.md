# Epic M03.5 — Trips dashboard & trip shell (frontend)

> Milestone: [03 — Trips & Days](../README.md) · PRD refs: §5.1, §5.10, §7.2.

## Description

Build the navigation spine in the web app: a **Trips dashboard** showing **Current / Upcoming /
Past** with the **current trip surfaced prominently** (today's day number and a budget-glance slot),
a **trip create/edit form**, and a **trip shell** that hosts the per-day surfaces delivered by later
milestones. This is the UI every feature milestone renders inside.

**Estimated effort:** ~2–3 developer-days (one developer).

## Acceptance Criteria

- [ ] A **Trips dashboard** renders the **Current / Upcoming / Past** buckets from Epic 03, with the
      **current trip surfaced prominently** showing **today's day number** and a **budget-glance
      slot** (figures provided later by Milestone 05; this epic renders the slot) (PRD §5.1).
- [ ] A **trip create/edit form** drives Epic 01's CRUD (name, destinations, start/end date, cover,
      EUR shown as fixed) with archive/delete affordances (PRD §5.1).
- [ ] A **trip shell** hosts a per-day view that is **deep-linkable** (trip → day) and provides the
      mounting points the Planning/Budget/Journal/Maps milestones fill in (PRD §5.1).
- [ ] The UI only shows trips the user is **authorized** to see (driven by Epic 03/04 server-side
      scoping — the client never decides authorization) (PRD §5.9).
- [ ] Surfaces are **responsive** (laptop + mobile) using basic styling now and Milestone 09
      components when available (PRD §5.10, §7.2).

## Implementation Details / Architecture

- Part of the **`/web` React + TypeScript** app (PRD §7.2), rendered inside the authenticated, gated
  app shell from Milestone 02.
- The current-trip surface and budget-glance slot are **placeholders for Milestone 05's figures** —
  this epic owns the layout slot, not the budget math (clean module boundary, PRD §7.1).
- The trip shell defines stable routes/mount points so Milestones 04–07 add day surfaces without
  restructuring navigation.

## Dependencies

- **Upstream:** Milestone 02 (auth context, gated app), Epic 01 (trip CRUD API), Epic 02 (days),
  Epic 03 (bucketed listing).
- **Downstream:** Milestones 04–07 render inside the trip/day shell; Milestone 05 fills the budget
  glance; Milestone 09 restyles these surfaces.

## Costs Impact

Negligible — static assets served from Firebase Hosting free tier (PRD §8.1).

## Designs

- Trips dashboard: [assets/01-trips-dashboard.svg](../../../assets/01-trips-dashboard.svg) (PRD §4.1).
- Day plan shell: [assets/02-day-plan-map.svg](../../../assets/02-day-plan-map.svg) (PRD §4.2).
- Mobile trip context: [assets/03-mobile-and-sharing.svg](../../../assets/03-mobile-and-sharing.svg) (PRD §4.3).

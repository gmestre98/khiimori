# Milestone 03 — Trips & Days

**Status:** Milestone overview — to be split into focused epics (≤5 acceptance criteria each) following the [Milestone 01](../M01-foundations/README.md) pattern. The criteria below are the milestone-level spec and the source material for that split.

> Trip CRUD, the Current/Upcoming/Past trips menu, and auto-generated days mapped to real dates.
>
> PRD refs: §5.1, §9 (Trip, Day, TripMembership), §7.1 (Trip/Itinerary module).

---

## Description

The structural backbone of the product: trips and the days within them. A traveller can create,
edit, archive, and delete a trip (name, destinations, start/end date, cover, members). Trips are
grouped automatically into **Current**, **Upcoming**, and **Past** based on dates vs. today, with
the **current trip surfaced prominently** as the day-to-day driver while travelling. Each trip
**auto-generates one Day per date** in its range; days map to real calendar dates.

This epic delivers the navigation spine that Planning (04), Budgets (05), Journal (06), and Maps
(07) all hang off.

## Acceptance Criteria

- [ ] **Create / edit / archive / delete** a trip with: name, destinations, start date, end date,
      cover image, `base_currency = EUR` (fixed), `status` (PRD §5.1, §9).
- [ ] On create (or date change), the trip **auto-generates exactly one `Day` per date** in
      `[start_date, end_date]`, each with an `index` and `date`; shrinking the range removes
      now-out-of-range days (with a guard/confirm if they hold data) and extending adds new ones.
- [ ] A **Trips menu** groups trips into **Current / Upcoming / Past**, derived automatically from
      dates vs. today (`2026-06-11` is "today" in examples) — no manual bucketing (PRD §5.1).
- [ ] The **current trip is surfaced prominently**, showing **today's day number** and a
      **budget-progress glance** (budget figures provided by Epic 05; this epic renders the slot).
- [ ] **Archive** hides a trip from the active lists without deleting; **delete** removes the trip
      and cascades its days/owned entities transactionally (PRD §7.7).
- [ ] The trip **owner** is recorded as a `TripMembership` with role `Owner` at creation (PRD §9);
      membership management UI is Epic 08, but the owner row is created here.
- [ ] All trip reads/writes are **authorized server-side** via the Sharing module: a user only
      sees trips they own or are a member of (PRD §5.9, §6) — wired through the authz hook from
      Epic 02 even before full sharing UI lands.
- [ ] Days are addressable for deep-linking (e.g. trip → day) to support Planning/Journal/Maps.
- [ ] Unit + integration tests for day generation on range edits, and bucketing edge cases
      (trip spanning today, single-day trip, past/future boundaries) (PRD §7.6).

## Implementation Details / Architecture

- Lives in the **`trip` module** (PRD §7.1) with the `trip.*` schema (PRD §7.7).
- Entities (PRD §9):
  - `Trip(id, owner_id, name, destinations, start_date, end_date, base_currency, cover, status)`
  - `Day(id, trip_id, date, index, notes)`
  - `TripMembership(id, trip_id, user_id, role)` — the `Owner` row created here; full lifecycle
    in Epic 08.
- **Day generation** is derived from the date range and kept consistent on every range edit
  (transactional add/remove). `index` gives a stable order; days still map to **real calendar
  dates** (PRD §5.1) — reordering is conceptual, not date-detaching.
- **Bucketing logic** (Current/Upcoming/Past) is computed from `start_date`/`end_date` vs. today,
  centralised server-side so web and mobile agree.
- `destinations` stored to support multi-destination trips; `cover` references a Cloud Storage
  object (bucket from Epic 01) or an external URL.
- **Authorization** is delegated to the Sharing module interface (Epic 08) so this module never
  decides access on its own (PRD §5.9).
- Frontend: Trips dashboard (Current/Upcoming/Past), trip create/edit form, and a trip shell that
  hosts the per-day surfaces from later epics. Uses Epic 09 components.

## Dependencies

- **Upstream:** Epic 01 (DB, service), Epic 02 (authenticated user as `owner_id`).
- **Soft dependency:** Epic 08 (Sharing/Access) provides the authorization interface; until it
  lands, an owner-only authorization shim is acceptable, replaced by the real membership check.
- **Downstream:** Epics 04, 05, 06, 07 all operate within a trip/day; the dashboard's
  budget-glance slot is filled by Epic 05.

## Costs Impact

Negligible incremental cost — trips/days are small relational rows in the existing Neon database
(PRD §8, within free tier). Cover images, if uploaded, use the Cloud Storage bucket and count
toward storage (minor; the 1 GB/trip cap in Epic 06 is about photos, but covers should be sized
sensibly).

## Designs

- Trips dashboard (Current/Upcoming/Past): [assets/01-trips-dashboard.svg](../assets/01-trips-dashboard.svg) (PRD §4.1).
- Day-within-trip context: [assets/02-day-plan-map.svg](../assets/02-day-plan-map.svg) (PRD §4.2).
- Mobile trip context: [assets/03-mobile-and-sharing.svg](../assets/03-mobile-and-sharing.svg) (PRD §4.3).

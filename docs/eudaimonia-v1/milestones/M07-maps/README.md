# Milestone 07 — Maps

**Status:** Milestone overview — to be split into focused epics (≤5 acceptance criteria each) following the [Milestone 01](../M01-foundations/README.md) pattern. The criteria below are the milestone-level spec and the source material for that split.

> A per-day map of stays, activities, and transport as pins in itinerary order, with two-way
> pin↔item highlighting — built on Google Maps Platform behind a cost-protecting Geo proxy.
>
> PRD refs: §5.6, §7.1 (Geo/Maps proxy module), §7.8, §8.4–8.5.

---

## Description

Give each day a **map**. It shows the day's **stay, activities, and transport as pins**, in
**itinerary order**, with an **indicative route** between them. **Tapping a pin highlights the
matching itinerary item, and vice-versa.** Maps are built on **Google Maps Platform**, but every
Maps call is **proxied through the backend Geo service** to protect API keys and **control cost** —
the classic "leaked key → surprise bill" risk is designed out from the start.

## Acceptance Criteria

- [ ] Each day renders a **map with pins** for that day's `Stay`, located `PlanItem`s
      (activities/transport), in **itinerary order** (PRD §5.6).
- [ ] An **indicative route** is drawn between pins in order (PRD §5.6).
- [ ] **Tapping a pin highlights the matching itinerary item; selecting an item highlights its
      pin** (two-way) (PRD §5.6).
- [ ] Items/stays **without a location are omitted** from the map gracefully (planning allows
      location-less items — Epic 04).
- [ ] **All Google Maps calls go through the backend Geo proxy** — **no Maps API key is ever
      shipped to the client** (PRD §5.6, §6, §8.5).
- [ ] Geocoding (turning a location into coordinates) is handled server-side via the Geo module and
      **cached** to limit repeat calls (PRD §8.4 #2 "cache map loads").
- [ ] The Maps API key is **restricted** and protected by **hard quota caps + a billing alert**
      (set in Epic 01 / PRD §8.5); the Geo proxy stays within the **free monthly Maps allowance**
      at expected low usage (PRD §8.1).
- [ ] Unit + integration tests for the proxy (key never leaks, quota/caching behaviour) and
      pin/item correlation (PRD §7.6).

## Implementation Details / Architecture

- Lives in the **`geo` module** (PRD §7.1, "Geo / Maps proxy") with a `geo.*` schema for caches
  (PRD §7.7).
- **Thin internal interface (PRD §7.0):** a `MapProvider`/`Geocoder` interface wraps Google Maps
  Platform so the provider can be swapped without touching callers.
- **Proxy responsibilities (PRD §5.6, §8.4–8.5):**
  - Hold the **restricted Maps API key** in Secret Manager (Epic 01); never expose it client-side.
  - **Geocode** locations server-side and **cache** results (a location rarely moves) to minimise
    billable calls.
  - Provide routing/route hints for the day's ordered pins.
- **Client rendering:** the web/mobile app renders the map using data/tiles brokered by the proxy;
  any client-side Maps SDK use must still avoid embedding a privileged key (use a restricted,
  referer-locked key or proxy tiles — chosen approach documented, defaulting to maximum key
  protection per PRD §8.5).
- **PostGIS** is available if richer geo queries are wanted later, but v1 needs only pins + an
  indicative route — keep it simple (PRD §7.0, §7.7).
- Pins consume locations from `Stay`/`PlanItem` (Epic 04) via the Trip module interface.

## Dependencies

- **Upstream:** Epic 01 (Secret Manager, Geo module skeleton, **Maps quota caps + billing alert**),
  Epic 04 (located stays/plan items to map).
- **External/manual:** Google Maps Platform enabled on the GCP project with a **restricted key**
  (author-provided).
- **Downstream:** part of the day-planning experience and the e2e journey (Epic 10).

## Costs Impact

This epic carries the **biggest variable cost risk** in the project (PRD §8.4 #2):

- **Maps → Google Maps Platform**, expected **€0** at low use within the free monthly allowance
  (PRD §8.1).
- The named risk is a **leaked/unrestricted key → surprise bill**. Mitigations are mandatory and
  mostly delivered here + Epic 01: **proxy all calls via Geo**, **restrict the key**, **cache map
  loads/geocodes**, and **hard quota caps + billing alert** (PRD §8.4 #2, §8.5).
- Scale-up lever (PRD §8.6): if usage approaches the free allowance, **raise the Maps quota cap**
  (kept low by default) — pay-per-use, deliberately and visibly.

## Designs

Day plan with map and pins (pin↔item correlation):
[assets/02-day-plan-map.svg](../assets/02-day-plan-map.svg) (PRD §4.2). Map pins may use restrained
accent colour per the minimal theme (PRD §5.10).

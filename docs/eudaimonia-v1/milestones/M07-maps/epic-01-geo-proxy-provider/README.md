# Epic M07.1 — Geo proxy & `MapProvider` interface

> Milestone: [07 — Maps](../README.md) · PRD refs: §5.6, §6, §7.0, §7.1, §8.5.

## Description

Stand up the `geo` module as a **backend proxy** for Google Maps Platform. Every Maps call is routed
through it; the **restricted Maps API key lives only in Secret Manager** and is **never shipped to
the client**. Google Maps is wrapped behind a thin internal **`MapProvider`/`Geocoder` interface**
so the provider can be swapped without touching callers. This is the project's biggest cost-risk
mitigation: the "leaked key → surprise bill" path is designed out.

**Estimated effort:** ~2–3 developer-days (one developer).

## Acceptance Criteria

- [ ] A **`geo` module** with a `geo.*` schema exposes a **`MapProvider`/`Geocoder` interface**
      wrapping Google Maps Platform (PRD §7.0, §7.1).
- [ ] **All Maps calls go through the backend proxy**; the **Maps API key is never shipped to the
      client** — it lives only in Secret Manager (from Milestone 01) (PRD §5.6, §6, §8.5).
- [ ] If any client-side Maps SDK use is unavoidable, it uses a **restricted, referer-locked key or
      proxied tiles** — the chosen approach is documented, defaulting to maximum key protection
      (PRD §8.5).
- [ ] The proxy relies on the Maps key being **restricted** with **hard quota caps + billing alert**
      (set in Milestone 01) so it stays within the **free monthly allowance** at expected usage
      (PRD §8.1, §8.5).
- [ ] Unit + integration tests prove **the key never leaks** to client-visible responses and the
      proxy boundary holds (provider faked) (PRD §7.6).

## Implementation Details / Architecture

- Lives in the **`geo` module** (PRD §7.1, "Geo / Maps proxy"). The `MapProvider`/`Geocoder`
  interface is the seam: `Geocode(location) → coords`, route hints for ordered pins, etc.
- The proxy holds the **restricted key** server-side (Secret Manager from Milestone 01) and brokers
  map data/tiles to the client; clients render maps from proxy-brokered data, never a privileged key.
- **PostGIS** is available for richer geo later, but v1 needs only pins + an indicative route — keep
  it simple (PRD §7.0, §7.7).

## Dependencies

- **Upstream:** Milestone 01 (Secret Manager, Geo module skeleton, **Maps quota caps + billing
  alert**). Google Maps Platform enabled with a **restricted key** is author-provided.
- **Downstream:** Epic 02 (geocoding/caching builds on the provider), Epics 03–04 (frontend consumes
  proxy data), Milestone 10 (verifies key never leaks).

## Costs Impact

Carries the **biggest variable cost risk** in the project (PRD §8.4 #2). Mitigations delivered here:
**proxy all calls via Geo** and **never ship the key**. Expected **€0** within the free monthly Maps
allowance; the scale-up lever is "raise the Maps quota cap" (PRD §8.5–8.6).

## Designs

No bespoke UI — this is the server-side proxy behind the map. The rendered map is Epics 03–04
([assets/02-day-plan-map.svg](../../../assets/02-day-plan-map.svg), PRD §4.2).

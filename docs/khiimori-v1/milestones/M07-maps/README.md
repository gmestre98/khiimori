# Milestone 07 — Maps

> A per-day map of stays, activities, and transport as pins in itinerary order, with two-way
> pin↔item highlighting — built on Google Maps Platform behind a cost-protecting Geo proxy that
> never ships a key to the client.
>
> PRD refs: §5.6, §7.1 (Geo/Maps proxy module), §7.8, §8.4–8.5.

---

## Milestone goal

Give each day a **map**. It shows the day's **stay, activities, and transport as pins**, in
**itinerary order**, with an **indicative route** between them, and **tapping a pin highlights the
matching itinerary item and vice-versa**. Maps are built on **Google Maps Platform**, but **every
Maps call is proxied through the backend Geo service** to protect API keys and **control cost** —
the "leaked key → surprise bill" risk is designed out from the start. Geocoding is server-side and
**cached**; the restricted key is protected by the **hard quota caps + billing alert** set in
Milestone 01.

## Milestone-level Definition of Done

- Each day renders a **map with pins** for that day's `Stay` and located `PlanItem`s in **itinerary
  order**, with an **indicative route** between them; items/stays **without a location are omitted
  gracefully** (PRD §5.6).
- **Tapping a pin highlights the matching itinerary item, and selecting an item highlights its pin**
  (two-way) (PRD §5.6).
- **All Google Maps calls go through the backend Geo proxy** — **no Maps API key is ever shipped to
  the client** — and geocoding is handled server-side and **cached** to limit repeat calls (PRD
  §5.6, §6, §8.4 #2, §8.5).
- The Maps API key is **restricted** and protected by **hard quota caps + a billing alert** (from
  Milestone 01); the proxy stays within the **free monthly Maps allowance** at expected usage (PRD
  §8.1, §8.5).
- Unit + integration tests cover the proxy (key never leaks, quota/caching behaviour) and pin/item
  correlation (PRD §7.6).

## Epics in this milestone

| Epic | Title | AC | Est. (dev-days) | Cost-relevant |
|------|-------|----|-----------------|---------------|
| [01](epic-01-geo-proxy-provider/README.md) | Geo proxy & `MapProvider` interface | 5 | ~2–3 | yes (key protection) |
| [02](epic-02-geocoding-caching/README.md) | Server-side geocoding & caching | 4 | ~1–2 | yes (the Maps-cost epic) |
| [03](epic-03-per-day-map-rendering/README.md) | Per-day map rendering (frontend) | 4 | ~2 | — |
| [04](epic-04-pin-item-correlation/README.md) | Two-way pin↔item correlation (frontend) | 3 | ~1 | — |
| | **Milestone total** | **16** | **~6–8** (≈ 1.5–2 weeks, one developer) | — |

> **Estimates** assume one developer familiar with the stack; they cover implementation, tests, and
> review. The biggest variable cost risk in the project is concentrated in Epics 01–02 (proxy + key
> protection + caching).

## Sequencing within the milestone

```
01 Geo proxy & MapProvider ── 02 Geocoding & caching ── 03 Per-day map rendering ── 04 Pin↔item correlation
```

## Designs

Day plan with map and pins (pin↔item correlation):
[assets/02-day-plan-map.svg](../../assets/02-day-plan-map.svg) (PRD §4.2). Map pins may use
restrained accent colour per the minimal theme (PRD §5.10).

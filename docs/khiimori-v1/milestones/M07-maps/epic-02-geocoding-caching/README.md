# Epic M07.2 — Server-side geocoding & caching

> Milestone: [07 — Maps](../README.md) · PRD refs: §5.6, §7.7, §8.4 #2.

## Description

Turn a location into coordinates **server-side** through the Geo proxy, and **cache** results so a
location (which rarely moves) isn't re-geocoded on every map load. Caching is the PRD's explicit
mitigation for the Maps cost risk ("cache map loads"). This epic also exposes the ordered route hints
the map uses to draw an indicative route between the day's pins.

**Estimated effort:** ~1–2 developer-days (one developer).

## Acceptance Criteria

- [ ] **Geocoding** (location → coordinates) is performed **server-side** via the `Geocoder`
      interface from Epic 01; the client never calls Google directly (PRD §5.6, §8.5).
- [ ] Geocode results are **cached** (in the `geo.*` schema) and reused across map loads to **limit
      repeat billable calls** (PRD §8.4 #2).
- [ ] The proxy provides **ordered route hints** for a day's pins so the map can draw an **indicative
      route** (PRD §5.6).
- [ ] Unit + integration tests cover cache hit/miss (a repeated location is not re-geocoded) and
      ordered-route output (PRD §7.6).

## Implementation Details / Architecture

- Lives in the **`geo` module** (PRD §7.1) on top of Epic 01's `MapProvider`/`Geocoder`.
- The cache keys on the location string/identity; a cache entry persists in the `geo.*` schema so it
  survives restarts and serves all users (a location is not user-specific) (PRD §7.7).
- Cache invalidation is minimal in v1 (locations rarely move); a simple TTL or manual refresh is
  enough — keep it simple (PRD §7.0).

## Dependencies

- **Upstream:** Epic 01 (proxy + provider interface, restricted key), Milestone 04 (located
  stays/plan items supply the locations to geocode).
- **Downstream:** Epic 03 (renders pins from cached coordinates + route hints), Milestone 10 (cost
  review verifies caching).

## Costs Impact

The **Maps-cost epic**'s core mitigation: **caching geocodes** keeps billable Maps calls low (PRD
§8.4 #2). Expected **€0** within the free allowance; combined with Epic 01's proxy/key restriction
and Milestone 01's quota caps, surprise bills are designed out (PRD §8.5).

## Designs

Indicative route between ordered pins:
[assets/02-day-plan-map.svg](../../../assets/02-day-plan-map.svg) (PRD §4.2).

## User stories

The epic is split into **3 small user stories**, each sized **≤4h for one developer** (implementation +
tests + review). Each story file is a standalone agent-ready prompt with enough context to implement it
without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-server-geocoding.md) | Server-side geocoding | ~3h | AC1 | Epic 01 |
| [S2](S2-geocode-cache.md) | Geocode cache (hit/miss) | ~3h | AC2 | S1, Epic 01 S1 |
| [S3](S3-route-hints-tests.md) | Ordered route hints & tests | ~3h | AC3, AC4 | S1, S2, M04 |

**Total:** ~9h (≈ 1–2 dev-days), consistent with the epic's ~1–2 dev-day estimate.

### Sequencing

```
S1 Server geocoding ── S2 Geocode cache ── S3 Route hints & tests
```

> Caching geocodes is the core Maps-cost mitigation (PRD §8.4 #2) — verified in Milestone 10's cost
> review.

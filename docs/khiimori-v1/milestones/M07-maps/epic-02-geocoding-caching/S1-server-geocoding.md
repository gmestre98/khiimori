# S1 — Server-side geocoding

## Context
**Geocoding** (location → coordinates) is performed **server-side** via the `Geocoder` interface from
Epic 01; the client never calls Google directly (PRD §5.6, §8.5).

## Task
Implement server-side geocoding through the `Geocoder` interface.

## Acceptance criteria
- [x] A geocode operation turns a location string into coordinates via the Epic 01 `Geocoder`.
- [x] The operation is exposed through the proxy (client → proxy → provider), never client → Google.
- [x] Errors (not found, provider failure) are handled gracefully and surfaced without leaking the key.
- [x] A unit test covers geocoding via a faked provider.

## Constraints
- Go through the proxy/provider interface (Epic 01); no direct client Google calls.
- No caching yet (S2) — but structure the call so the cache slots in front cleanly.

## Definition of done
Locations geocode to coordinates server-side via the provider interface; faked-provider test green.

## Dependencies
Epic 01 (proxy, Geocoder interface). Caching in S2.

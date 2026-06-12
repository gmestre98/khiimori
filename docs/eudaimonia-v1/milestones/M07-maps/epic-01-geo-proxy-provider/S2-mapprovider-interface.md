# S2 — `MapProvider` / `Geocoder` interface & Google scaffold

## Context
Google Maps is wrapped behind a thin internal **`MapProvider`/`Geocoder` interface** so the provider can
be swapped without touching callers (PRD §7.0). This story defines the interface and a Google
implementation scaffold.

## Task
Define the `MapProvider`/`Geocoder` interface and a Google implementation scaffold built from config.

## Acceptance criteria
- [ ] A `Geocoder` interface exposes `Geocode(location) → coords` and the `MapProvider` exposes route
  hints for ordered pins (the operations Epics 02–04 need).
- [ ] A Google implementation scaffold is constructed from config (no live calls yet) and sits behind the
  interface (callers depend on the interface).
- [ ] The interface is documented so Epic 02 (caching) and the frontend (Epics 03–04) consume a stable
  contract.
- [ ] A unit test asserts the interface is satisfied by the scaffold (provider faked).

## Constraints
- A Google Maps client library is a likely dependency — **confirm with the author before adding it**
  (project rule: stdlib-first, ask before deps).
- No key handling here (S3); no caching here (Epic 02).

## Definition of done
A `MapProvider`/`Geocoder` interface with a config-built Google scaffold exists behind a swappable seam.

## Dependencies
S1, M01.2 S1 (config). Key handling in S3; caching in Epic 02.

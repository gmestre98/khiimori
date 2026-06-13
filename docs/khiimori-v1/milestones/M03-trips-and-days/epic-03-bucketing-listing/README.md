# Epic M03.3 — Trip bucketing & listing (Current/Upcoming/Past)

> Milestone: [03 — Trips & Days](../README.md) · PRD refs: §5.1, §9.

## Description

Provide the **Trips listing** that groups a user's trips into **Current / Upcoming / Past**, derived
automatically from `start_date`/`end_date` vs. today — no manual bucketing. The bucketing logic is
**centralised server-side** so web and mobile agree, and it identifies the **current trip** (the one
spanning today) so the UI can surface it prominently. Archived trips are excluded from the active
lists.

**Estimated effort:** ~1–2 developer-days (one developer).

## Acceptance Criteria

- [ ] A listing endpoint returns the user's trips grouped into **Current / Upcoming / Past**, derived
      from dates vs. today (computed server-side, not client-side) (PRD §5.1).
- [ ] The **current trip** (range spanning today) is identifiable in the response so the UI can
      surface it prominently; **archived** trips are excluded from active buckets (PRD §5.1).
- [ ] Bucketing handles edge cases correctly: a trip **spanning today**, a **single-day** trip, and
      the **past/future boundaries** around `start_date`/`end_date` (PRD §5.1).
- [ ] Unit + integration tests cover the bucketing edge cases above with a fixed "today" reference
      (PRD §7.6).

## Implementation Details / Architecture

- Lives in the **`trip` module** (PRD §7.1). Bucketing is a pure function of `start_date`,
  `end_date`, and a server-supplied "today", centralised so both clients share one source of truth.
- The listing is **authorization-scoped** (Epic 04): a user only sees trips they own or are a member
  of — the listing calls the authz layer rather than filtering client-side (PRD §5.9).
- The current-trip marker feeds Epic 05's prominent current-trip surface (today's day number + the
  budget-glance slot filled by Milestone 05).

## Dependencies

- **Upstream:** Epic 01 (Trip model), Epic 04 (authorization scoping for the listing).
- **Downstream:** Epic 05 (dashboard renders the buckets); Milestone 05 fills the current-trip
  budget glance.

## Costs Impact

Negligible — a read query over small relational rows in the existing Neon database (PRD §8, free
tier).

## Designs

Trips dashboard (Current/Upcoming/Past):
[assets/01-trips-dashboard.svg](../../../assets/01-trips-dashboard.svg) (PRD §4.1).

## User stories

The epic is split into **3 small user stories**, each sized **≤4h for one developer** (implementation +
tests + review). Each story file is a standalone agent-ready prompt with enough context to implement it
without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-bucketing-function.md) | Bucketing function (Current/Upcoming/Past) | ~3h | AC1, AC2 | Epic 01 |
| [S2](S2-trips-listing-endpoint.md) | Trips listing endpoint (authorization-scoped) | ~3h | AC1, AC2 | S1, Epic 04 |
| [S3](S3-bucketing-tests.md) | Bucketing edge-case tests | ~2.5h | AC3, AC4 | S1, S2 |

**Total:** ~8.5h (≈ 1–2 dev-days), consistent with the epic's ~1–2 dev-day estimate.

### Sequencing

```
S1 Bucketing function ── S2 Listing endpoint ── S3 Edge-case tests
```

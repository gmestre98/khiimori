# Epic M02.4 — Profile management (view/edit, EUR fixed)

> **Status:** ✅ Done — all 4 stories merged (PRs [#177](https://github.com/gmestre98/khiimori/pull/177)–[#180](https://github.com/gmestre98/khiimori/pull/180)) and all 4 acceptance criteria verified (unit + real-DB integration against PG18; live checks on the deployed service — `GET`/`PATCH /me` are auth-gated, 401 for missing/invalid sessions, with credentialed CORS for the web origin). `GET /me` reads and `PATCH /me` edits the **session user's own row** (name/avatar/home_base/theme); `default_currency` is EUR, read-only server-side.
>
> Milestone: [02 — Auth & Profile](../README.md) · PRD refs: §5.7, §9, §11.5.

## Description

Let an authenticated user **view and edit a basic profile**: name, avatar, home base, and theme
preference. Changes persist and are reflected immediately. Currency is displayed as **EUR** and is
**not editable** — a forward-compatible field with no UI in v1. This epic owns the profile read/write
API; the screen that renders it is Epic 05 with Milestone 09's components.

**Estimated effort:** ~1–2 developer-days (one developer).

## Acceptance Criteria

- [x] **Profile read** returns the authenticated user's `name, avatar, home_base`, theme preference
      (from `prefs`), and `default_currency` (PRD §5.7, §9).
- [x] **Profile edit** updates `name, avatar, home_base`, and theme preference; changes **persist
      and are reflected immediately** (PRD §5.7).
- [x] `default_currency` is returned as **EUR** and is **rejected/ignored if a client attempts to
      change it** — no currency selector in v1 (PRD §5.7, §9, §11.5).
- [x] All profile reads/writes require a valid session (Epic 03 middleware) and only ever touch the
      **authenticated user's own row** (PRD §6).

## Implementation Details / Architecture

- Lives in the **`auth` module**, operating on the `User`/profile row from Epic 02 (PRD §7.1).
- Theme preference is stored in the `prefs` JSONB (PRD §9) so adding future preference toggles needs
  no migration (PRD §7.7).
- Avatar may reference an external URL (from the OAuth profile) or, if uploads are added later, the
  Cloud Storage bucket (M01.4) — kept simple in v1 (PRD §7.0).
- EUR is enforced server-side: the field is read-only at the API boundary, not just hidden in the UI.

## Dependencies

- **Upstream:** Epic 02 (user/profile row), Epic 03 (auth middleware).
- **Downstream:** Epic 05 (profile screen renders/edits via this API); theme preference feeds the
  design system in Milestone 09.

## Costs Impact

Negligible. Profile edits are small row updates in the existing Neon database (PRD §8 — within free
tier).

## Designs

A simple form surface using the black/white theme (PRD §5.10); mobile profile context in
[assets/03-mobile-and-sharing.svg](../../../assets/03-mobile-and-sharing.svg). Final visual treatment
via Milestone 09.

## User stories

The epic is split into **4 small user stories**, each sized **≤4h for one developer** (implementation +
tests + review). Each story file is a standalone agent-ready prompt with enough context to implement it
without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-profile-read.md) | Profile read endpoint | ~2.5h | AC1 | Epic 02, Epic 03 |
| [S2](S2-profile-edit.md) | Profile edit endpoint | ~3h | AC2 | S1 |
| [S3](S3-eur-readonly.md) | EUR read-only enforcement (server-side) | ~2h | AC3 | S1, S2 |
| [S4](S4-profile-authz-tests.md) | Own-row authorization & profile tests | ~2.5h | AC4 | S1–S3 |

**Total:** ~10h (≈ 1–2 dev-days), consistent with the epic's ~1–2 dev-day estimate.

### Sequencing

```
S1 Read ── S2 Edit ──┬─ S3 EUR read-only
                     └─ S4 Own-row authz & tests
```

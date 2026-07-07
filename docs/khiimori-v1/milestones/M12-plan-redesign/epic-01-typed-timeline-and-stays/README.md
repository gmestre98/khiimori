# Epic M12.1 — Typed timeline & single stays

> **Status:** 🚧 In progress.

> Milestone: [12 — Plan redesign](../README.md) · PRD refs: §5.2, §9, §7.0.

## Description

Rework the day planner so it matches how a traveller plans a day, addressing three
concrete problems with the current surface:

1. **Stays are buried and unbounded.** A stay is *where you sleep* — it belongs
   pinned at the top of the day, and there should be exactly one per night.
2. **`type` does double duty** as a loose label *and* the budget category, so
   "what an item is" and "how it costs" are the same field. They shouldn't be.
   Different kinds of item behave differently — transport has an origin→destination
   and an arrival time; a note has no time, place, or cost.
3. **Timed and untimed items live in two separate sections.** A traveller wants
   one timeline ordered by the clock, with the freedom to drop a time-less item
   anywhere in it (e.g. "sometime after lunch, before the 3pm tour").

## Acceptance Criteria

- [ ] Plan items carry a first-class **`kind`** (activity | transport | food |
      note) independent of their budget category; the API accepts/returns it and
      it defaults to `activity` for older payloads. — **S1**
- [ ] **Transport** items support an origin, a destination, and an arrival time
      end-to-end (API + storage). — **S2**
- [ ] Only **one stay per night** is allowed; overlapping stays are rejected by
      the API (and the UI edits rather than adds). — **S3**
- [ ] The day plan shows a **single pinned stay slot** on top, editable inline,
      with add/edit and per-night context. — **S4**
- [ ] Add/edit uses a **kind picker** with per-kind fields (transport
      origin→destination), and **cost category is decoupled** from kind
      (auto-suggested, overridable). — **S5**
- [ ] Timed and untimed items render in **one drag-ordered timeline**; untimed
      items can be placed anywhere, including between timed items. — **S6**

## User stories

| # | Story | Layer | Epic AC | Depends on |
|---|-------|-------|---------|-----------|
| [S1](S1-backend-kind.md) | Backend: plan-item `kind` | backend | AC1 | — |
| [S2](S2-backend-transport-fields.md) | Backend: transport origin/destination/arrival | backend | AC2 | S1 |
| [S3](S3-backend-single-stay.md) | Backend: one stay per night | backend | AC3 | — |
| [S4](S4-frontend-stay-slot.md) | Frontend: pinned single-stay slot | frontend | AC4 | S3 |
| [S5](S5-frontend-kinded-forms.md) | Frontend: kind picker + decoupled cost | frontend | AC5 | S1, S2 |
| [S6](S6-frontend-drag-timeline.md) | Frontend: unified drag timeline | frontend | AC6 | S5 |

### Sequencing

```
S1 kind ─┬─ S2 transport ──┐
         └──────────────────┴─ S5 kinded forms ── S6 drag timeline
S3 single stay ── S4 stay slot
```

## Costs Impact

Cost-neutral. No infra change (€0-idle preserved); schema changes are additive
columns + a validation rule. No new runtime dependencies (PRD §7.0).

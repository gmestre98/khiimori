# Milestone 06 — Journal & Media

> **Status:** ✅ Done — 4 epics, 18 ACs. PRs [#295](https://github.com/gmestre98/khiimori/pull/295)–[#297](https://github.com/gmestre98/khiimori/pull/297) (E01), [#299](https://github.com/gmestre98/khiimori/pull/299)–[#301](https://github.com/gmestre98/khiimori/pull/301) (E02), [#303](https://github.com/gmestre98/khiimori/pull/303)–[#307](https://github.com/gmestre98/khiimori/pull/307) (E03), [#309](https://github.com/gmestre98/khiimori/pull/309)–[#313](https://github.com/gmestre98/khiimori/pull/313) (E04). Journal entries with auto-save, photo upload + MediaStore, 1 GB/trip quota + thumbnails, and journal UI with offline queue. One AC deferred to M09 (mobile-first responsive surfaces with M09 components).

> A fast daily journal with photos, offline-capable on mobile, with a 1 GB-per-trip photo cap and
> server-side resizing to keep storage costs predictable. Past trips keep their journals as a
> permanent record.
>
> PRD refs: §5.5, §6 (Offline, Privacy), §9 (JournalEntry, Photo), §7.1 (Journal/Media module).

---

## Milestone goal

A **low-friction daily journal**: one entry per day with free text, optional rating, weather/mood,
and **photos**. Journaling often happens with poor connectivity, so entries **auto-save** and are
**offline-capable** on mobile, syncing when back online via the shared queue from Milestone 04.
**Photo storage is capped at 1 GB per trip**, enforced server-side, with the UI showing usage and
warning as the cap nears; **server-side resizing/thumbnails** keep storage and egress within budget.
Photos and journals are **visible only to the owner and explicitly invited members**, enforced
server-side via the Sharing module (Milestone 08).

## Milestone-level Definition of Done

- One **journal entry per day** with free-text body, optional rating, weather, mood, and
  `author_id`; text **auto-saves** with no explicit save (PRD §5.5, §9).
- **Photos** can be attached to an entry (storage URL + optional caption), stored in Cloud Storage
  behind a `MediaStore` interface (PRD §9, §7.0).
- The **1 GB-per-trip cap is enforced server-side** on upload (rejected beyond the cap with a clear
  message), the UI **shows usage and warns** as the cap nears, and **server-side thumbnails** are
  generated so list/grid views load light variants (PRD §5.5, §8.4).
- Journal/photo edits are **offline-capable** on mobile (reusing Milestone 04's queue), **past-trip
  journals remain accessible**, and access is **owner + invited members only**, enforced server-side
  (PRD §5.5, §6, §5.9).
- Unit + integration tests cover cap enforcement, offline queue/replay, and thumbnail generation
  (PRD §7.6).

## Epics in this milestone

| Epic | Title | AC | Est. (dev-days) | Cost-relevant |
|------|-------|----|-----------------|---------------|
| [01](epic-01-journal-entries/README.md) | Journal entries (`journal.*`, auto-save) | 4 | ~1–2 | — |
| [02](epic-02-photo-upload-storage/README.md) | Photo upload & object storage (`MediaStore`) | 4 | ~2 | yes (Cloud Storage) |
| [03](epic-03-quota-thumbnails/README.md) | Storage quota (1 GB/trip) & server-side thumbnails | 5 | ~2–3 | yes (the storage-cost epic) |
| [04](epic-04-journal-ui-offline/README.md) | Journal UI & offline (frontend) | 5 | ~2–3 | — |
| | **Milestone total** | **18** | **~7–10** (≈ 1.5–2.5 weeks, one developer) | — |

> **Estimates** assume one developer familiar with the stack; they cover implementation, tests, and
> review. Epic 04's offline behaviour **reuses the queue/replay mechanism built in Milestone 04**.

## Sequencing within the milestone

```
01 Journal entries ──┬─ 02 Photo upload & storage ── 03 Quota (1 GB/trip) & thumbnails ──┐
                     └──────────────────────────────────────────────────────────────────┴─ 04 Journal UI & offline
```

## Designs

Mobile journal view: [assets/03-mobile-and-sharing.svg](../../assets/03-mobile-and-sharing.svg)
(PRD §4.3). Minimal black/white treatment with photos as the visual content (PRD §5.10).

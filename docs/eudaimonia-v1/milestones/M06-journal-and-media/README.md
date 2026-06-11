# Milestone 06 — Journal & Media

**Status:** Milestone overview — to be split into focused epics (≤5 acceptance criteria each) following the [Milestone 01](../M01-foundations/README.md) pattern. The criteria below are the milestone-level spec and the source material for that split.

> A fast daily journal with photos, offline-capable on mobile, with a 1 GB-per-trip photo cap and
> server-side resizing to keep storage costs predictable.
>
> PRD refs: §5.5, §6 (Offline, Privacy), §9 (JournalEntry, Photo), §7.1 (Journal/Media module).

---

## Description

A **low-friction daily journal**: one entry per day with free text, optional rating, weather/mood,
and **photos**. Journaling often happens with poor connectivity, so entries **auto-save** and are
**offline-capable** on mobile, syncing when back online. **Photo storage is capped at 1 GB per
trip** with the UI showing usage and warning as the cap nears; **server-side resizing/thumbnails**
keep storage and egress within budget. Past trips keep their journals as a **permanent record**,
and the living plan (Epic 04) feeds naturally into the journal.

## Acceptance Criteria

- [ ] One **journal entry per day** with: free-text body, optional rating, weather, mood (PRD §5.5, §9).
- [ ] Attach **photos** to an entry; each photo has a storage URL and optional caption (PRD §9).
- [ ] **Auto-save** of journal text; no explicit save needed (PRD §5.5).
- [ ] **Offline-capable on mobile:** entries (and photo intents) created/edited offline **queue and
      sync** when connectivity returns, reusing the shared offline mechanism with Epic 04 (PRD §6).
- [ ] **Photo cap = 1 GB per trip**, **enforced server-side on upload**; uploads beyond the cap are
      rejected with a clear message (PRD §5.5, §9).
- [ ] The UI **shows per-trip photo usage and warns as the cap approaches** (PRD §5.5).
- [ ] **Server-side resizing/thumbnails** are generated so list/grid views load light versions, not
      full-resolution originals (PRD §5.5, §8.4 egress mitigation).
- [ ] Journals on **past trips remain accessible as a permanent record** (PRD §5.5).
- [ ] Photos and journals are **visible only to the owner and explicitly invited members** —
      enforced server-side via the Sharing module (PRD §6 Privacy, §5.9).
- [ ] `JournalEntry.author_id` records who wrote the entry (supports shared trips where an Editor
      companion journals) (PRD §9).
- [ ] Unit + integration tests for cap enforcement, offline queue/replay, and thumbnail generation
      (PRD §7.6).

## Implementation Details / Architecture

- Lives in the **`journal` module** (PRD §7.1, "Journal / Media") with the `journal.*` schema
  (PRD §7.7).
- Entities (PRD §9):
  - `JournalEntry(id, day_id, author_id, body, rating, weather, mood, created_at)` — `body` may use
    a **JSONB** column for rich content (PRD §7.7 flexibility-within-Postgres).
  - `Photo(id, journal_entry_id, storage_url, caption)`.
- **Object storage:** photos stored in the **Cloud Storage** bucket (Epic 01) behind a thin
  internal `MediaStore` interface so storage can be swapped (PRD §7.0, §7.8).
- **Upload pipeline:** validate → enforce **per-trip 1 GB quota** (tracked per trip, checked
  server-side before persisting) → store original → generate **resized/thumbnail** variants.
  Thumbnails can be produced inline or via an async step; keep it inline first unless a need for
  Pub/Sub appears (PRD §7.0, §7.8 "optional async").
- **Offline strategy (shared with Epic 04):** text entries queue as idempotent writes; photo
  uploads queue as deferred binary uploads that replay when online. One mechanism, used by both
  epics (PRD §7.0 "fewest moving parts").
- **Privacy & authz:** all reads/writes pass the Sharing module's server-side check (PRD §5.9, §6).

## Dependencies

- **Upstream:** Epic 01 (Cloud Storage bucket, DB), Epic 02 (author identity), Epic 03 (days).
- **Shared:** offline sync mechanism (co-designed with Epic 04); Sharing authorization (Epic 08).
- **Downstream:** contributes to the e2e "write journal" journey (Epic 10).

## Costs Impact

This is the **main storage-cost epic** (PRD §8.1, §8.4):

- **Photos → Cloud Storage.** Free allowance ~5 GB Standard; expected **€0–1/mo** at a few GB.
- **The 1 GB-per-trip cap** (PRD §5.5, §11.4) exists specifically to keep Cloud Storage costs
  **predictable**.
- **Photo egress is a named cost risk** (PRD §8.4 #3) — mitigated here by **server-side
  thumbnails/resizing** so large originals aren't repeatedly transferred.
- If photo volume grows, the scale-up lever is "raise storage / add thumbnailing" (PRD §8.6) — no
  redesign. Keeping inline thumbnailing avoids standing up Pub/Sub until justified.

## Designs

Mobile journal view: [assets/03-mobile-and-sharing.svg](../assets/03-mobile-and-sharing.svg)
(PRD §4.3). Minimal black/white treatment with photos as the visual content (PRD §5.10).

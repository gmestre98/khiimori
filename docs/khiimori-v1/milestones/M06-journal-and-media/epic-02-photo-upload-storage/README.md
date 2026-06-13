# Epic M06.2 — Photo upload & object storage (`MediaStore`)

> Milestone: [06 — Journal & Media](../README.md) · PRD refs: §5.5, §7.0, §7.8, §9.

## Description

Let a traveller **attach photos** to a journal entry. Each photo has a storage URL and optional
caption and is stored in the **Cloud Storage** bucket (from Milestone 01) behind a thin internal
**`MediaStore` interface** so storage can be swapped without touching callers. This epic owns upload
and persistence of originals; the per-trip quota and thumbnail generation are Epic 03.

**Estimated effort:** ~2 developer-days (one developer).

## Acceptance Criteria

- [ ] A migration adds `Photo(id, journal_entry_id, storage_url, caption)` to `journal.*` per PRD §9
      (PRD §7.7).
- [ ] A photo can be **attached to a journal entry** (upload → stored in Cloud Storage → `Photo` row
      with `storage_url` and optional `caption`) (PRD §5.5, §9).
- [ ] Storage goes through a thin **`MediaStore` interface** wrapping Cloud Storage so the backend
      can be swapped without touching callers (PRD §7.0, §7.8).
- [ ] Upload validates the file (type/size sanity) before persisting; unit + integration tests cover
      attach and the `MediaStore` boundary (with the storage backend faked) (PRD §7.6).

## Implementation Details / Architecture

- Lives in the **`journal` module** (PRD §7.1). The `MediaStore` interface keeps Cloud Storage behind
  a seam: `Put(object) → url`, `Delete(url)`, etc.
- This epic stores the **original**; Epic 03 adds the **per-trip 1 GB quota check before persisting**
  and **resized/thumbnail variants**. Upload ordering is designed so the quota check (Epic 03) slots
  in front of `MediaStore.Put` without rework.
- Access is authorized server-side via the Sharing module (Milestone 08) — owner + invited members
  only (PRD §5.9, §6).

## Dependencies

- **Upstream:** Milestone 01 (Cloud Storage bucket, service), Epic 01 (journal entries to attach to),
  Milestone 02 (author identity).
- **Downstream:** Epic 03 (quota + thumbnails wrap this upload path), Epic 04 (UI), Milestone 08
  (authorization).

## Costs Impact

Introduces **Cloud Storage** usage (PRD §8.1, §8.4). Free allowance ~5 GB Standard; expected
**€0–1/mo** at a few GB. The hard guardrail (1 GB/trip cap) and egress mitigation (thumbnails) are
Epic 03.

## Designs

Photos as visual content in the journal:
[assets/03-mobile-and-sharing.svg](../../../assets/03-mobile-and-sharing.svg) (PRD §4.3, §5.10).

## User stories

The epic is split into **3 small user stories**, each sized **≤4h for one developer** (implementation +
tests + review). Each story file is a standalone agent-ready prompt with enough context to implement it
without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-photo-schema-migration.md) | `Photo` schema & migration | ~2.5h | AC1 | Epic 01 |
| [S2](S2-mediastore-interface.md) | `MediaStore` interface & Cloud Storage implementation | ~3.5h | AC3 | M01.4 |
| [S3](S3-photo-upload-attach.md) | Photo upload & attach to entry | ~3.5h | AC2, AC4 | S1, S2, M03 Epic 04 |

**Total:** ~9.5h (≈ 2 dev-days), consistent with the epic's ~2 dev-day estimate.

### Sequencing

```
S1 Photo schema ──┐
S2 MediaStore ────┴─ S3 Photo upload & attach
```

> S3 leaves a **quota-check seam** in front of `MediaStore.Put` so Epic 03's 1 GB/trip enforcement and
> thumbnailing slot in without rework.

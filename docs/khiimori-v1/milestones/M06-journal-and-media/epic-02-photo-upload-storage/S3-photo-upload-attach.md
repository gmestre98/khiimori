# S3 — Photo upload & attach to entry

## Context
A photo can be **attached to a journal entry**: upload → store in Cloud Storage → `Photo` row with
`storage_url` and optional caption (PRD §5.5, §9). This story stores the **original**; the per-trip quota
check and thumbnails (Epic 03) slot into this pipeline.

## Task
Implement the photo upload endpoint that validates, stores the original, and attaches a `Photo` row.

## Acceptance criteria
- [ ] An upload endpoint accepts an image, **validates** it (type/size sanity), stores the original via
  `MediaStore` (S2), and writes a `Photo` row linked to the entry with an optional caption.
- [ ] Access is **authorized** via the trip `Authorizer` — only owner + invited members may upload.
- [ ] The pipeline is ordered so Epic 03's **quota check slots in front of `MediaStore.Put`** without
  rework (define the seam).
- [ ] Unit + integration tests cover a successful attach and the `MediaStore` boundary (storage faked).

## Constraints
- Store the original here; quota enforcement and thumbnails are Epic 03 (note the seam).
- Reject clearly on invalid files; do not persist a `Photo` row without a stored object.

## Definition of done
Photos can be uploaded and attached to entries via `MediaStore`, authorized, with a quota-check seam ready
for Epic 03; tests green.

## Dependencies
S1, S2, Epic 01 (entries), M03 Epic 04 (authz). Quota/thumbnails wrap this in Epic 03.

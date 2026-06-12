# S3 — Server-side resize / thumbnail generation

## Context
**Server-side resized/thumbnail variants** are generated on upload so list/grid views serve light
versions, mitigating photo egress (PRD §5.5, §8.4 #3). Thumbnailing is **inline** unless a measured need
for async appears (no Pub/Sub until justified, PRD §7.0, §7.8).

## Task
Generate resized/thumbnail variants in the upload pipeline and store them via `MediaStore`.

## Acceptance criteria
- [ ] On upload, one or more **resized/thumbnail variants** are generated and stored via `MediaStore`
  (S2/Epic 02), with their URLs associated to the `Photo`.
- [ ] Thumbnail generation is **inline** in the upload path (no async queue/Pub/Sub in v1).
- [ ] List/grid reads can return the **light variant** URL rather than the original.
- [ ] A unit test covers variant generation (dimensions/size reduced) with the image step faked or run on
  a small fixture.

## Constraints
- An image-processing library is a likely dependency — **confirm with the author before adding it**
  (project rule: stdlib-first, ask before deps).
- Keep inline; document the scale-up lever (async thumbnailing) without building it (PRD §8.6).
- Decide whether thumbnail bytes count toward the cap (coordinate with S1) and document it.

## Definition of done
Resized/thumbnail variants are generated inline on upload and served to list/grid views; test green.

## Dependencies
Epic 02 (MediaStore, upload), S1 (usage accounting decision). Consumed by Epic 04.

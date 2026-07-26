# S3 — Inline photo embedding + caps

> Epic: [M13.2 Trip document builder](README.md) · AC3.

## Goal

Optionally embed each day's photos into the document as inline images, bounded so
a photo-heavy trip can't blow up the request.

## Scope

- **Fetch from GCS**: for each day's journal photos, read the image bytes
  server-side (reuse the journal/media storage client) and inline them as
  `data:` URIs in the `<img>` `src`. Prefer **thumbnails** (already generated,
  M06) to keep size down; full-res is out of scope for v1.
- **Toggle**: an `includePhotos` flag on the export request (default on). Off →
  no images fetched, text-only doc.
- **Byte cap**: a total embedded-image budget (e.g. ~15 MB). Once exceeded, stop
  embedding further photos and note "(N more photos omitted)" — the export still
  succeeds.
- **Resilience**: a failed photo fetch is logged and skipped, never fatal to the
  export.

## Acceptance

- [x] With `includePhotos=true`, day photos appear inline (as data URIs) under
      each day, with captions.
- [x] With `includePhotos=false`, no photos are fetched and the doc is text-only.
- [x] Exceeding the byte cap stops embedding and annotates the omission; export
      still completes.
- [x] A GCS fetch error skips that photo without failing the export (unit test
      with a fake photo source).
</content>

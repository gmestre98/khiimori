# S2 — Photo attach & light grid

## Context
Users **attach photos** to an entry with optional captions, and list/grid views load the **light
thumbnail variants** (Epic 03) rather than full originals (PRD §5.5, §8.4 #3).

## Task
Build photo attach + a thumbnail grid in the journal UI.

## Acceptance criteria
- [x] Users can attach photos to the day's entry (Epic 02 upload) and add optional **captions**.
- [x] The grid/list renders **thumbnail variants** (Epic 03 S3), not originals; opening a photo can load a
  larger version on demand.
- [x] Upload progress and failures (including cap rejection, S3) are surfaced.
- [x] The grid is responsive and photo-forward (photos are the visual content, PRD §5.10).

## Constraints
- Default to light variants to protect egress/performance (PRD §8.4 #3, Milestone 09 perf budget).
- Photo upload intents queue offline (S4) where possible.

## Definition of done
Users can attach captioned photos and browse a light thumbnail grid.

## Dependencies
S1, Epic 02 (upload), Epic 03 (thumbnails). Cap warnings in S3; offline in S4.

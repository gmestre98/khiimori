# S1 — Journal editor (body / rating / weather / mood)

## Context
A per-day **journal editor** edits body, rating, weather, and mood with **auto-save** (no explicit save)
(PRD §5.5). Renders inside Milestone 03's trip/day shell, driving Epic 01's entry upsert.

## Task
Build the per-day journal editor.

## Acceptance criteria
- [ ] The editor edits the day's entry: free-text **body** plus optional **rating, weather, mood**
  (Epic 01).
- [ ] Text **auto-saves** with debouncing (no explicit save button); save state is surfaced subtly.
- [ ] One entry per day is respected (the editor edits the existing entry or creates it).
- [ ] The editor is responsive (web + mobile); Milestone 09 components when available.

## Constraints
- Saves go through the shared offline mutation layer (S4) so behaviour is identical online/offline.
- Reuse the auto-save approach from Milestone 04 (one pattern).

## Definition of done
Users can write a day's journal with auto-save across body/rating/weather/mood.

## Dependencies
M03 Epic 05 (trip/day shell), Epic 01 (entry API). Photos in S2; offline in S4.

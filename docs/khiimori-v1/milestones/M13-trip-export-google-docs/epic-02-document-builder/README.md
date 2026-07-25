# Epic M13.2 — Trip document builder

> **Status:** ✅ Done — all 3 stories shipped across PRs
> [#516](https://github.com/gmestre98/khiimori/pull/516) (S1 aggregator),
> [#517](https://github.com/gmestre98/khiimori/pull/517) (S2 HTML renderer), and
> [#518](https://github.com/gmestre98/khiimori/pull/518) (S3 photo embedding).
> 3/3 ACs satisfied. Each PR was self-reviewed on GitHub and its findings fixed
> (S1 authoritative day sort; S2 dead template funcs removed; S3 base64-size
> budgeting), and the rendered document was verified in a browser against the
> travelogue design. The new internal/export package (Model + Reader seam +
> BuildExportModel + html/template renderer + ImageFetcher/EmbedPhotos) is pure
> and fully unit-tested; the real SQL Reader, GCS ImageFetcher, and budget-rollup
> reuse are wired with the export endpoint in Epic 03. No new Go module.

> Milestone: [13 — Trip export to Google Docs](../README.md) · PRD refs: §9, §7.0.

## Description

Turn everything Khiimori knows about a trip into a single, well-structured
**HTML document** that Drive can convert into a native Google Doc. This epic is
pure assembly + rendering; it has no dependency on the Drive authorization work
and can be built and unit-tested in isolation (render to a local `.html` file).

The document is a **travelogue**, ordered the way the app already thinks about a
trip:

1. **Cover** — trip name, destinations, date range, day count, base currency,
   "Exported from Khiimori · <timestamp>".
2. **Trip summary** — destinations, total days, and the M12.2 spent-vs-planned
   budget (per category + totals), plus headline counts (activities, places,
   photos).
3. **Per day**, in order — day header (Day N · weekday, date); the night's stay;
   the planned timeline (time · kind icon · title · place · cost · booking); the
   "what happened" items (done/unplanned); the diary entry (mood/weather/rating +
   text); and, optionally, that day's photos with captions.
4. **Budget appendix** — the full budget table.

Cross-module reads (trip, day, plan items, stays, journal, budget, photos) are
composed in the **composition root**, matching the project's no-DI, schema-per-
module boundaries — the exporter depends on small reader interfaces, not on other
modules' stores directly.

## Acceptance Criteria

- [x] An `ExportModel` aggregates a trip's cover data, per-day content (stay,
      plan items, what-happened, journal), and budget rollup via reader
      interfaces satisfied at the composition root. — **S1**
- [x] A renderer produces styled, print-friendly HTML (cover, per-day sections,
      budget table, page breaks) from the `ExportModel`, deterministically. — **S2**
- [x] Photos can be embedded inline as data URIs (fetched from GCS), gated by an
      "include photos" flag and a total byte cap; export still succeeds (text
      only) when photos are excluded or a fetch fails. — **S3**

## User stories

| # | Story | Layer | Epic AC | Depends on |
|---|-------|-------|---------|-----------|
| [S1](S1-export-aggregator.md) | Export aggregator (`ExportModel`) | backend | AC1 | — |
| [S2](S2-html-renderer.md) | HTML renderer (`html/template`) | backend | AC2 | S1 |
| [S3](S3-photo-embedding.md) | Inline photo embedding + caps | backend | AC3 | S2 |

### Sequencing

```
S1 aggregator ── S2 renderer ── S3 photos
```

## Costs Impact

Cost-neutral for text (in-process reads + templating, stdlib `html/template`).
Photo embedding (S3) adds **GCS read egress** per export, bounded by the
include-photos toggle and a byte cap. No new Go module. €0-idle preserved.
</content>

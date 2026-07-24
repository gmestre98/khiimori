# S2 — HTML renderer (`html/template`)

> Epic: [M13.2 Trip document builder](README.md) · AC2.

## Goal

Render an `ExportModel` into styled, print-friendly HTML that converts cleanly
into a Google Doc.

## Scope

- **`internal/export/render.go`** using stdlib `html/template` (auto-escaping
  handles user text safely). One embedded template (`//go:embed`).
- **Layout** (matches the design mock): cover block; trip-summary with a budget
  table (planned / spent / delta per category + totals); one section per day —
  `<h2>` day header, a stay callout, the timeline as rows (time · kind · title ·
  place · cost · booking), a "what happened" list, and a diary block (rating as
  stars, weather, mood, then body); a budget appendix table.
- **Conversion-friendly HTML**: headings map to Google Doc heading styles;
  `<table>` for budget; `<hr>`/CSS `page-break-before` between days; inline styles
  or a single `<style>` head (Drive keeps common inline CSS, drops much of the
  rest — keep styling simple and semantic). No external CSS/fonts.
- Currency formatted in the trip's base currency; dates as "Weekday, DD Month".
- Photo `<img>` slots are rendered by S3 (this story leaves placeholders / omits
  them when photos are off).

## Acceptance

- [ ] Rendering a populated model produces valid, self-contained HTML with cover,
      per-day sections, and budget table; days page-break.
- [ ] User-supplied text (titles, diary, captions) is HTML-escaped.
- [ ] Golden-file test: a fixed `ExportModel` renders to a stable HTML snapshot.
- [ ] Manual check: the HTML, uploaded to Drive as a Doc, is readable and
      correctly structured (headings, table, page breaks).
</content>

# Epic M13.4 — Export UX

> Milestone: [13 — Trip export to Google Docs](../README.md) · PRD refs: §7.0.
> Status: ⬜ Planned.

## Description

The user-facing surface over the export endpoint: an entry point on the trip, an
options dialog, progress + a link to the finished Doc, re-export with a
"last exported" hint, an optional folder chooser, and clean handling of the
not-connected / reconnect / doc-deleted states.

## Acceptance Criteria

- [ ] A trip-level "Export to Google Docs" action opens a dialog with options
      (include photos, include budget); if Drive isn't connected it routes to the
      connect flow (E01·S4) first. — **S1**
- [ ] Export shows progress, then success with "Open in Google Docs" and "Open
      folder" links; re-export shows the last-exported time and updates the same
      doc. — **S2**
- [ ] The user can choose a destination folder via the Google Picker; the picked
      folder id is passed to the export endpoint. — **S3** *(optional / can ship
      after S1–S2)*
- [ ] Reconnect-required and other failures are surfaced with a clear recovery
      action. — **S4**

## User stories

| # | Story | Layer | Epic AC | Depends on |
|---|-------|-------|---------|-----------|
| [S1](S1-export-dialog.md) | Export entry point + options dialog | frontend | AC1 | E03·S4 |
| [S2](S2-progress-result.md) | Progress, result links, last-exported | frontend | AC2 | S1 |
| [S3](S3-folder-picker.md) | Google Picker folder chooser | frontend | AC3 | S1 |
| [S4](S4-error-handling.md) | Error / reconnect handling | frontend | AC4 | S1 |

### Sequencing

```
S1 dialog ── S2 result ── S4 errors
          └─ S3 picker (optional)
```

## Costs Impact

Client-side only. **S3 loads Google's hosted Picker + GSI scripts** and needs a
browser API key (Picker API enabled, key restricted to our origin) — an infra
config change, not a Go dependency. €0-idle preserved. S1/S2/S4 add no external
resources.
</content>

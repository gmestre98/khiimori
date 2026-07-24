# S2 — Progress, result links, last-exported

> Epic: [M13.4 Export UX](README.md) · AC2.

## Goal

Show the export running, then the result, and reflect re-export state.

## Scope

- **Progress**: while the request is in flight, a spinner / "Building your
  travelogue…" state (export is synchronous, seconds-scale). Disable re-submit.
- **Success**: show "Open in Google Docs" (→ `doc_url`) and "Open folder" (→
  `folder_url`) links. Links open via the host link-confirmation.
- **Last exported**: persist/read `last_exported_at` (from the endpoint / a small
  GET) and show "Last exported <relative time>" on the trip; the dialog's button
  reads "Update Google Doc" on re-export to make in-place update obvious.

## Acceptance

- [ ] Running an export shows progress, then the two result links.
- [ ] Re-exporting shows the last-exported time and the button reflects "update".
- [ ] Verified in a browser (link opens the created Doc).
</content>

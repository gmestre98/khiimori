# S1 — Export entry point + options dialog

> Epic: [M13.4 Export UX](README.md) · AC1.

## Goal

Give the user a way to start an export and choose what goes in.

## Scope

- **Entry point**: an "Export to Google Docs" action on the trip (trip overview
  header or the trip "…" menu).
- **Dialog**: toggles for *Include photos* (default on) and *Include budget*
  (default on); a short note about where it lands ("Saves to your Google Drive ·
  Khiimori travelogues"); primary "Export" button.
- **Gate on connection**: on open, check `getDriveConnection()`. If not connected,
  show a "Connect Google Drive" step that runs E01·S4's connect flow, then return
  to the dialog.
- **API client** (`web/src/lib/api.ts`): `exportTripToGoogleDoc(tripId, opts)` →
  the E03·S4 endpoint.

## Acceptance

- [ ] The action opens the dialog with the two toggles.
- [ ] When Drive isn't connected, the dialog leads through connect first, then
      lets the user export.
- [ ] Verified in a browser.
</content>

# S4 — Frontend Drive connection UI

> Epic: [M13.1 Drive authorization & token store](README.md) · AC4.

## Goal

Let the user connect and disconnect Google Drive from the app, and see status.

## Scope

- **API client** (`web/src/lib/api.ts`): `getDriveConnection()`,
  `connectDrive()` (navigates to the connect endpoint / consent), and
  `disconnectDrive()`.
- **Settings/profile surface**: a "Google Drive" row showing connected state
  ("Connected · exporting to *Khiimori travelogues*") with a Connect or
  Disconnect button. On return from consent, read the success/failure flag and
  toast accordingly.
- Reuse existing profile page patterns and design tokens; handle the
  not-connected, connected, and just-failed states.

## Acceptance

- [x] User can connect Drive (round-trips through Google consent) and see the
      connected state without a manual refresh.
- [x] User can disconnect; the UI returns to the not-connected state.
- [x] Verified in a browser (per project convention for UI stories).
</content>

# S4 — Error / reconnect handling

> Epic: [M13.4 Export UX](README.md) · AC4.

## Goal

Turn the endpoint's typed failures into clear recovery actions.

## Scope

- **`drive_not_connected` / `drive_reconnect_required` (409)**: show "Reconnect
  Google Drive" and run the connect flow, then retry the export.
- **Delivery failure (502)**: "Couldn't reach Google Drive. Try again." with a
  retry.
- **Offline**: export needs the network and the user's Drive; if offline, disable
  the action with a hint (consistent with the app's offline patterns — export is
  not queued).
- Never surface raw error strings; follow the app's toast/error conventions.

## Acceptance

- [ ] A revoked/disconnected Drive prompts reconnect and can resume to a
      successful export.
- [ ] A transient delivery failure shows a retry, not a dead end.
- [ ] Offline disables export with an explanation.
- [ ] Verified in a browser (simulate 409 and 502).
</content>

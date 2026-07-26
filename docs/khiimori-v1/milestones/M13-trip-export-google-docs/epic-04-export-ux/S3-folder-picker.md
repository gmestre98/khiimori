# S3 — Google Picker folder chooser (optional)

> **Deferred (by choice, 2026-07-25).** The default app-created "Khiimori
> travelogues" folder meets the core requirement; this Picker needs GCP config
> (Picker API + a browser API key) the app owner must provision and can't be
> verified without it. The export endpoint already accepts a `folderId`, so it
> can be added later with no backend change.


> Epic: [M13.4 Export UX](README.md) · AC3. *Optional — can ship after S1–S2.*

## Goal

Let the user drop the doc into an existing folder of their choice, the
least-privilege way (`drive.file` can't list folders; the Picker grants access to
exactly what the user picks).

## Scope

- **Load** Google's hosted GSI + Picker scripts (`https://apis.google.com/js/api.js`,
  `https://accounts.google.com/gsi/client`) on demand from the dialog.
- **Config**: a browser **API key** (Picker API enabled, key restricted to our
  origin) + the OAuth **client id**, exposed as build config (`VITE_…`). The
  Picker needs an OAuth access token with `drive.file` — obtained via GSI token
  client at pick time (its own consent), scoped to picking.
- **Flow**: "Choose folder…" opens the Picker in folder-select mode; on pick, pass
  the `folderId` to `exportTripToGoogleDoc`. Default remains *Khiimori
  travelogues* if the user doesn't pick.
- Remember the last-picked folder per trip (endpoint already persists it, S3/E03).

## Acceptance

- [ ] "Choose folder…" opens the Picker; selecting a folder targets the export
      there and the doc appears in it.
- [ ] Declining the Picker leaves the default folder in effect.
- [ ] Scripts/keys load only when the chooser is used; no impact on the rest of
      the app.
- [ ] Verified in a browser.

## Note

If the Picker's added config/scripts aren't wanted, this story can be dropped: the
app-created default folder alone satisfies "lands in my Drive in a folder." The
Picker is what upgrades that to "a folder **I choose**."
</content>

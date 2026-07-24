# Milestone 13 — Trip export to Google Docs

> Milestone: 13 · PRD refs: §7.0 (dependency posture), §9 (Data model), §6 (Auth).

Khiimori holds a full record of a trip — the planned timeline, the stays, what
actually happened, the diary, the photos, and the budget — but that record only
lives inside the app. This milestone lets a traveller **export a whole trip as a
single Google Doc that lands directly in their Google Drive**, so it can be
kept, printed, shared, or edited outside Khiimori as a finished travelogue.

The shape of the feature:

- **One editable Google Doc per trip, per user.** Re-exporting updates the same
  document in place (same Drive file id) rather than littering Drive with copies.
- **It lands in the user's own Drive**, in a folder they control — by default an
  app-created "Khiimori travelogues" folder, or a folder the user picks.
- **The doc is a travelogue**, not a data dump: a cover, a trip summary with the
  spent-vs-planned budget, then a section per day (stay, timeline, what
  happened, diary, photos), rendered so it reads well on a printed page.

## The load-bearing correction

The current Google sign-in (`backend/internal/auth/google.go`) requests only the
`openid email profile` scopes and **discards the OAuth access/refresh token** —
it keeps just the verified ID-token claims for identity. So "we already have
Google login" does **not** grant Drive access. Writing to Drive needs a *new,
separately-consented* authorization with the `drive.file` scope, an offline
refresh token, and somewhere encrypted to store it. That authorization work is
Epic 01 and is the real spine of this milestone; everything else builds on it.

| Epic | Title | Status |
|------|-------|--------|
| [01](epic-01-drive-authorization/README.md) | Drive authorization & token store | ⬜ Planned |
| [02](epic-02-document-builder/README.md) | Trip document builder | ⬜ Planned |
| [03](epic-03-drive-delivery/README.md) | Drive delivery & one-doc-per-trip | ⬜ Planned |
| [04](epic-04-export-ux/README.md) | Export UX | ⬜ Planned |

### Sequencing

```
E01 Drive auth ──┬─────────────────────────────┐
                 │                              │
E02 Doc builder ─┴─ E03 Drive delivery ── E04 Export UX
```

E02 (turning trip data into HTML) has no dependency on the auth work and can be
built in parallel; E03 needs both a rendered document (E02) and a live token
(E01); E04 is the surface over E03.

## Key design decisions

1. **Render path: HTML → Drive conversion, not the Docs API.** The document is
   built as styled HTML server-side and uploaded via Drive `files.create` with
   `mimeType: application/vnd.google-apps.document` and a `text/html` source,
   which Drive converts into a native, editable Google Doc. This is far simpler
   than composing `documents.batchUpdate` requests and gives us headings,
   tables, lists, page breaks, and inline images for free. Fidelity is imperfect
   (some CSS is dropped on conversion) — accepted for v1; the Docs API stays open
   as a later refinement if we need pixel control.

2. **Talk to Drive over stdlib `net/http`, not the Google API client library.**
   `files.create`/`files.update` are a single multipart POST with a
   `Bearer` token; an `oauth2.TokenSource` gives us auto-refresh. This keeps us
   inside the project's stdlib-only convention and avoids pulling in the large
   `google.golang.org/api` tree. (See Drawbacks — this is the one place we
   consciously *don't* add a dependency that would otherwise be idiomatic.)

3. **Least-privilege scope: `drive.file` only.** This grants access *only* to
   files and folders the app creates or the user explicitly opens via the Google
   Picker — never the user's whole Drive. It avoids the broad `drive` scope,
   which is a Google "restricted" scope and would drag the app into an annual
   third-party security assessment (CASA) once published to external users.

4. **"A folder you choose" is honoured via the Google Picker.** With `drive.file`
   the backend cannot list the user's existing folders, so the *default* target
   is an app-created `Khiimori travelogues` folder. To drop the doc into a
   pre-existing folder of the user's choice, the frontend uses the Google Picker
   (Epic 04, S3) — picking a folder grants the app write access to exactly that
   folder. This is the least-privilege way to satisfy the requirement.

5. **Synchronous export.** Building the doc (text + thumbnails) runs inside the
   export request; no queue/worker is added, preserving the €0-idle posture. A
   photo-heavy trip is bounded by an "include photos" toggle and a byte cap. If
   this ever exceeds the Cloud Run request budget, moving to an async job is the
   documented scaling lever — not v1 scope.

## Conventions

Inherits milestone-wide conventions (EUR currency, server-side authorization,
modular monolith with schema-per-module, €0-idle cost posture). **Exception to
§7.0:** this milestone adds Google Cloud infrastructure (Drive API enabled on the
GCP project, an encryption key for stored refresh tokens) and, on the frontend,
loads Google's hosted Picker/GSI scripts. No new *Go module* dependency is added
(Drive is called over stdlib `net/http`). All exceptions are called out per-epic.
</content>
</invoke>

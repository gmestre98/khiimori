# S3 — Backend: one stay per night

> Epic: [M12.1 Typed timeline & single stays](README.md) · AC3.

## Goal

A stay is *where you sleep*, and you sleep in one place per night. Reject a
create/edit whose `[check_in, check_out)` range shares any night with an existing
stay in the same trip. Adjacent stays (check out and check in on the same day)
are fine — that's how you change hotels mid-trip.

## Scope

- **Store** (`stay_store.go`): `stayOverlaps` — half-open interval overlap
  (`existing.check_in < new.check_out AND new.check_in < existing.check_out`),
  excluding the row being written (self) via an id sentinel (`nilUUID` for a
  brand-new stay, the `ClientID`/`stayID` for upsert/edit). `CreateStay` and
  `UpdateStay` call it and return `errStayOverlap` on conflict. A stay missing
  either date has no coverage interval and never conflicts.
- **Handlers** (`stay_handlers.go`): map `errStayOverlap` → **409** with code
  `stay_overlap` on both create and edit.

## Why application-level, not a DB constraint

The natural DB enforcement is an `EXCLUDE USING gist` constraint over
`daterange(check_in, check_out)`. It's rejected here because stays created before
this rule may already overlap, and an `EXCLUDE` constraint (unlike `CHECK`/`FK`)
**cannot be added `NOT VALID`** — so the migration would validate all existing
rows and fail to deploy against real data. Write-time enforcement keeps new/edited
stays clean without a risky data-validating migration. (No migration in this
story.)

## Acceptance

- [x] Overlapping create → 409 `stay_overlap`; overlapping edit → 409.
- [x] Adjacent stays (check_out == next check_in) allowed; date-less stays never
      conflict; editing a stay onto its own nights still allowed (self-exclusion).
- [x] Unit tests (409 mapping on create + edit) and an integration test covering
      overlap / adjacency / date-less / edit-overlap / self-edit.

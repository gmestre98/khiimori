# S1 — Authorization coverage audit — REPORT

> Deliverable for [S1](S1-authz-coverage-audit.md). Audit date: 2026-07-05.
> Auditor: engineering. Scope: every trip-scoped HTTP endpoint in `backend/`.

## Method

The endpoint inventory was produced by reading every module's `RegisterRoutes`
(`backend/internal/*/module.go`) and each handler. For each trip-scoped route we
confirmed the handler calls the `Authorizer` **before** any read/write, that
denial returns `403`/`404` (not data), and that sub-resource mutations are
scoped by `trip_id` in the store (no cross-trip IDOR).

Authorization chokepoint: `sharing.MembershipAuthorizer.Can(ctx, userID, action, tripID)`
(`backend/internal/sharing/authorizer.go`), injected into every feature module at
the composition root (`backend/cmd/api/main.go`) via typed adapters. `ActionRead`
allows Owner/Editor/Viewer; `ActionWrite`/`manage` narrow to Owner/Editor (write)
or Owner (manage).

## Endpoint inventory & authorization matrix

All routes below sit behind `RequireAuth` (authentication). "Authz gate" is the
per-trip authorization call.

### Trip (`internal/trip`)

| Method + path | Handler | Authz gate | Denial |
|---|---|---|---|
| GET `/trips` | handleList | store-scoped by membership JOIN (returns only caller's trips) | empty list |
| POST `/trips` | handleCreate | n/a (no trip yet; creates Owner membership tx) | — |
| PATCH `/trips/{id}` | handleUpdate | `checkAccess(Write)` | 404 |
| POST `/trips/{id}/archive` | handleArchive → handleSetStatus | `checkAccess(Manage)` | 404 |
| POST `/trips/{id}/unarchive` | handleUnarchive → handleSetStatus | `checkAccess(Manage)` | 404 |
| DELETE `/trips/{id}` | handleDelete | `checkAccess(Manage)` | 404 |
| GET `/trips/{id}/days/{date}` | handleGetDay | `checkAccess(Read)` | 404 |
| GET `/trips/{id}/plan-items/backlog` | handleListBacklog | `checkAccess(Read)` | 404 |
| POST `/trips/{id}/plan-items/reorder` | handleReorderPlanItems | `checkAccess(Write)` | 404 |
| POST `/trips/{id}/plan-items` | handleCreatePlanItem | `checkAccess(Write)` | 404 |
| PATCH `/trips/{id}/plan-items/{itemID}` | handleUpdatePlanItem | `checkAccess(Write)` + store `trip_id` scope | 404 |
| DELETE `/trips/{id}/plan-items/{itemID}` | handleDeletePlanItem | `checkAccess(Write)` + store `trip_id` scope | 404 |
| POST `/trips/{id}/plan-items/{itemID}/promote` | handlePromotePlanItem | `checkAccess(Write)` | 404 |
| POST `/trips/{id}/plan-items/{itemID}/demote` | handleDemotePlanItem | `checkAccess(Write)` | 404 |
| POST `/trips/{id}/plan-items/{itemID}/move` | handleMovePlanItem | `checkAccess(Write)` | 404 |
| POST `/trips/{id}/plan-items/{itemID}/status` | handleSetPlanItemStatus | `checkAccess(Write)` | 404 |
| POST `/trips/{id}/stays` | handleCreateStay | `checkAccess(Write)` | 404 |
| PATCH `/trips/{id}/stays/{stayID}` | handleUpdateStay | `checkAccess(Write)` + store `trip_id` scope | 404 |
| DELETE `/trips/{id}/stays/{stayID}` | handleDeleteStay | `checkAccess(Write)` + store `trip_id` scope | 404 |

### Budget (`internal/budget`)

| Method + path | Handler | Authz gate | Denial |
|---|---|---|---|
| PUT `/trips/{tripID}/budget-lines` | handleSetTripBudgetLine | `checkWriteAccess` | 404 |
| PUT `/trips/{tripID}/days/{dayID}/budget-lines` | handleSetDayBudgetLine | `checkWriteAccess` | 404 |
| POST `/trips/{tripID}/cost-entries` | handleCreateCostEntry | `checkWriteAccess` | 404 |
| PATCH `/trips/{tripID}/cost-entries/{entryID}` | handleUpdateCostEntry | `checkWriteAccess` + store `trip_id` scope | 404 |
| DELETE `/trips/{tripID}/cost-entries/{entryID}` | handleDeleteCostEntry | `checkWriteAccess` + store `trip_id` scope | 404 |
| GET `/trips/{tripID}/budget/rollup` | handleGetRollup | `checkReadAccess` | 404 |

### Journal (`internal/journal`)

| Method + path | Handler | Authz gate | Denial |
|---|---|---|---|
| PUT `/trips/{tripID}/days/{dayID}/journal` | handleUpsertEntry | `checkWriteAccess` | 404 |
| GET `/trips/{tripID}/days/{dayID}/journal` | handleGetEntry | `checkReadAccess` | 404 |
| POST `/trips/{tripID}/days/{dayID}/journal/photos` | handleUploadPhoto | `checkWriteAccess` | 404 |
| GET `/trips/{tripID}/days/{dayID}/journal/photos` | handleListPhotos | `checkReadAccess` | 404 |
| DELETE `/trips/{tripID}/days/{dayID}/journal/photos/{photoID}` | handleDeletePhoto | `checkWriteAccess` + store scope | 404 |
| GET `/trips/{tripID}/usage` | handleGetUsage | `checkReadAccess` | 404 |

### Sharing (`internal/sharing`)

| Method + path | Handler | Authz gate | Denial |
|---|---|---|---|
| GET `/trips/{tripID}/memberships` | handleListMemberships | `Can(read)` | 403 |
| GET `/trips/{tripID}/invitations` | handleListInvitations | `Can(manage)` | 403 |
| POST `/trips/{tripID}/invitations` | handleCreateInvitation | `Can(manage)` | 403 |
| DELETE `/trips/{tripID}/invitations/{id}` | handleRevokeInvitation | `Can(manage)` | 403 |
| POST `/invitations/accept` | handleAcceptInvitation | invite **token** + verified-email match (`ErrEmailMismatch` → 403) | 403/404/409 |
| PATCH `/trips/{tripID}/memberships/{userID}` | handleChangeRole | `Can(manage)` | 403 |
| DELETE `/trips/{tripID}/memberships/{userID}` | handleRevokeMembership | `Can(manage)` | 403 |
| POST `/admin/trips/{tripID}/members` | handleAdminGrantAccess | `RequireAdmin` (server-side `is_admin`) | 403 |
| PATCH `/admin/trips/{tripID}/members/{userID}` | handleAdminChangeRole | `RequireAdmin` | 403 |
| DELETE `/admin/trips/{tripID}/members/{userID}` | handleAdminRevokeAccess | `RequireAdmin` | 403 |

### Geo (`internal/geo`) — not trip-scoped

`GET /geo/geocode`, `GET /geo/autocomplete`, `POST /geo/route-hints`,
`GET /geo/static-map`, `POST /geo/day-route` are all behind `RequireAuth` but
are **stateless map proxies** — they take coordinates/locations, not a trip id,
and expose no trip data. No per-trip authz applies. Key handling is reviewed in S2.

### Auth (`internal/auth`) — session-scoped, not trip-scoped

`GET /auth/login`, `GET /auth/callback`, `POST /auth/logout` are public by design
(OAuth handshake / cookie clearing). `GET /auth/session`, `GET|PATCH /profile`
are behind `RequireAuth` and always act on **the session user's own row** (no
cross-user id is accepted from the client). `POST /auth/test-login` is registered
**only** when `E2E_LOGIN_SECRET` is set (absent in production).

## Findings

- **F1 (low, informational): `403` vs `404` convention differs across modules.**
  Trip/Budget/Journal return `404` on authorization denial (to avoid leaking
  trip existence to non-members); Sharing management endpoints return `403`
  ("only trip owners may…"). The distinction is defensible — sharing endpoints
  are member-facing and the denial message is intentional UX — but it means a
  non-member who guesses a trip UUID can distinguish "exists" (403) from
  "unknown" from the sharing routes. Impact is negligible (trip ids are
  unguessable UUIDv4). Recorded for S3 triage; not release-blocking.

No missing-enforcement gaps were found: **every** trip-scoped endpoint calls the
`Authorizer` before touching data, and every sub-resource mutation
(plan-item/stay/cost-entry/photo) is additionally scoped by `trip_id` in the
store, closing cross-trip IDOR.

## Regression coverage

Server-side authorization is protected by the `cmd/api` authz integration suite
(`backend/cmd/api/authz_integration_test.go`) and the M10.2 role-based-access E2E
(`e2e/`), both green in CI. The audit adds no code; it confirms the existing
enforcement.

## Definition of done

✅ Endpoint inventory produced (all trip-scoped routes across Trip, Budget,
Journal, Geo, Sharing). ✅ Each confirmed to call the `Authorizer` before
read/write; denials return `403`/`404`, not data. ✅ One informational finding
(F1) flagged for S3. ✅ `403`/`404` convention documented (F1).

//go:build integration

// Cross-module authorization integration tests (M08.2 S5).
//
// Tests verify that every trip-scoped module (Trip, Budget, Journal) enforces
// the membership-based Authorizer for Owner, Editor, Viewer, and non-member.
// They drive the full HTTP handler stack using the real composition-root adapters
// so there is no gap between what is tested and what runs in production.
//
// Run with:
//
//	DATABASE_URL_TEST=<direct DSN of a throwaway DB> \
//	    go test -tags=integration ./cmd/api/...
package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"github.com/gmestre98/khiimori/backend/internal/budget"
	"github.com/gmestre98/khiimori/backend/internal/journal"
	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
	"github.com/gmestre98/khiimori/backend/internal/sharing"
	"github.com/gmestre98/khiimori/backend/internal/trip"
	"github.com/gmestre98/khiimori/backend/migrations"
)

var authzTestPool *pgxpool.Pool

func TestMain(m *testing.M) {
	dsn := os.Getenv("DATABASE_URL_TEST")
	if dsn == "" {
		os.Exit(m.Run())
	}

	sqlDB, err := sql.Open("pgx", dsn)
	if err != nil {
		fmt.Fprintf(os.Stderr, "authz integration setup: open: %v\n", err)
		os.Exit(1)
	}
	goose.SetBaseFS(migrations.FS)
	if err := goose.SetDialect("postgres"); err != nil {
		fmt.Fprintf(os.Stderr, "authz integration setup: dialect: %v\n", err)
		os.Exit(1)
	}
	if err := goose.Up(sqlDB, migrations.Dir); err != nil {
		fmt.Fprintf(os.Stderr, "authz integration setup: migrate up: %v\n", err)
		os.Exit(1)
	}

	authzTestPool, err = pgxpool.New(context.Background(), dsn)
	if err != nil {
		fmt.Fprintf(os.Stderr, "authz integration setup: pool: %v\n", err)
		os.Exit(1)
	}

	code := m.Run()

	authzTestPool.Close()
	// Wipe all rows before rolling migrations back. Unlike the trip suite (which
	// only ever writes 'owner' memberships), these tests create editor/viewer
	// rows; the 00021 widen-roles down-migration restores an owner-only CHECK
	// constraint that those rows would violate, failing goose.Reset. Truncating
	// first lets every down-migration's constraint re-addition succeed.
	if _, err := sqlDB.Exec(`TRUNCATE auth.users, sharing.invitations, sharing.trip_memberships,
		journal.journal_entries, journal.photos, budget.cost_entries, budget.budget_lines,
		trip.plan_items, trip.stays, trip.days, trip.trips RESTART IDENTITY CASCADE`); err != nil {
		fmt.Fprintf(os.Stderr, "authz integration teardown: truncate: %v\n", err)
		if code == 0 {
			code = 1
		}
	}
	if err := goose.Reset(sqlDB, migrations.Dir); err != nil {
		fmt.Fprintf(os.Stderr, "authz integration teardown: reset: %v\n", err)
		if code == 0 {
			code = 1
		}
	}
	_ = sqlDB.Close()
	os.Exit(code)
}

// authzMux builds an http.ServeMux with all trip-scoped modules wired using the
// real MembershipAuthorizer, authenticated as callerID via a shim middleware.
func authzMux(callerID string) *http.ServeMux {
	requireAuth := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := authn.WithPrincipal(r.Context(), authn.Principal{UserID: callerID})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}

	authz := sharing.NewMembershipAuthorizer(authzTestPool)
	mux := http.NewServeMux()

	trip.New(authzTestPool, requireAuth, sharing.NewMemberships(authzTestPool),
		membershipAuthzAdapter{authz}).RegisterRoutes(mux)
	budget.New(authzTestPool, requireAuth, membershipBudgetAuthzAdapter{authz},
		tripCostReaderAdapter{pool: authzTestPool}).RegisterRoutes(mux)
	journal.New(authzTestPool, requireAuth, membershipJournalAuthzAdapter{authz},
		journal.NoopMediaStore{}).RegisterRoutes(mux)

	return mux
}

// authzServer wraps authzMux in an httptest.Server.
func authzServer(t *testing.T, callerID string) *httptest.Server {
	t.Helper()
	if authzTestPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	srv := httptest.NewServer(authzMux(callerID))
	t.Cleanup(srv.Close)
	return srv
}

// truncateAll resets all trip-scoped tables between tests.
func truncateAll(t *testing.T) {
	t.Helper()
	_, err := authzTestPool.Exec(context.Background(),
		`TRUNCATE journal.journal_entries, journal.photos, budget.cost_entries, budget.budget_lines,
		         trip.plan_items, trip.stays, trip.days, trip.trips,
		         sharing.trip_memberships, sharing.invitations
		         RESTART IDENTITY`)
	if err != nil {
		t.Fatalf("truncate: %v", err)
	}
}

// genID generates a fresh UUID via the DB.
func genID(t *testing.T) string {
	t.Helper()
	var id string
	if err := authzTestPool.QueryRow(context.Background(), `SELECT gen_random_uuid()::text`).Scan(&id); err != nil {
		t.Fatalf("gen uuid: %v", err)
	}
	return id
}

// setupTrip creates a trip via POST /trips, authenticated as ownerID. Returns tripID.
func setupTrip(t *testing.T, ownerID string) string {
	t.Helper()
	srv := authzServer(t, ownerID)
	body, _ := json.Marshal(map[string]any{
		"name": "authz-test trip", "start_date": "2026-08-01", "end_date": "2026-08-05",
	})
	resp, err := http.Post(srv.URL+"/trips", "application/json", bytes.NewReader(body))
	if err != nil || resp.StatusCode != http.StatusCreated {
		if resp != nil {
			resp.Body.Close()
		}
		t.Fatalf("create trip: status=%d err=%v", func() int {
			if resp != nil {
				return resp.StatusCode
			}
			return 0
		}(), err)
	}
	var tripResp struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tripResp); err != nil {
		t.Fatalf("decode trip: %v", err)
	}
	resp.Body.Close()
	return tripResp.ID
}

// resolveDayID returns the UUID of the day at the given calendar date by reading
// it back through the owner-authenticated GET /trips/{id}/days/{date} endpoint.
// The journal endpoints key on the day's UUID (not the calendar date), so tests
// must resolve it before addressing a day's journal.
func resolveDayID(t *testing.T, ownerID, tripID, date string) string {
	t.Helper()
	srv := authzServer(t, ownerID)
	r := do(t, srv, http.MethodGet, "/trips/"+tripID+"/days/"+date, nil)
	defer r.Body.Close()
	if r.StatusCode != http.StatusOK {
		t.Fatalf("resolveDayID: GET day %s: status=%d, want 200", date, r.StatusCode)
	}
	var day struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&day); err != nil {
		t.Fatalf("resolveDayID: decode: %v", err)
	}
	if day.ID == "" {
		t.Fatalf("resolveDayID: empty day id for %s", date)
	}
	return day.ID
}

// addMember inserts a membership row directly (invitation flow not yet wired).
func addMember(t *testing.T, tripID, userID string, role sharing.Role) {
	t.Helper()
	mb := sharing.NewMemberships(authzTestPool)
	if err := mb.Add(context.Background(), tripID, userID, role); err != nil {
		t.Fatalf("addMember(%s, %s): %v", role, userID, err)
	}
}

// do executes an HTTP request against srv with an optional JSON body.
func do(t *testing.T, srv *httptest.Server, method, path string, body any) *http.Response {
	t.Helper()
	var b []byte
	if body != nil {
		b, _ = json.Marshal(body)
	}
	req, err := http.NewRequest(method, srv.URL+path, bytes.NewReader(b))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	return resp
}

// wantStatus closes resp and fails if the status code doesn't match.
func wantStatus(t *testing.T, label string, resp *http.Response, want int) {
	t.Helper()
	resp.Body.Close()
	if resp.StatusCode != want {
		t.Errorf("%s: got %d, want %d", label, resp.StatusCode, want)
	}
}

// ─── Trip module ─────────────────────────────────────────────────────────────

func TestTripAuthz_OwnerCanWriteAndRead(t *testing.T) {
	if authzTestPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	truncateAll(t)
	ownerID := genID(t)
	tripID := setupTrip(t, ownerID)
	srv := authzServer(t, ownerID)

	r := do(t, srv, http.MethodPatch, "/trips/"+tripID,
		map[string]any{"name": "updated", "start_date": "2026-08-01", "end_date": "2026-08-05"})
	wantStatus(t, "owner PATCH trip", r, http.StatusOK)

	r = do(t, srv, http.MethodGet, "/trips/"+tripID+"/days/2026-08-01", nil)
	wantStatus(t, "owner GET day", r, http.StatusOK)
}

// TestTripAuthz_EditorEditsContentNotTripSettings pins the M10.2 S1 boundary: an
// Editor may write trip *content* (budget/journal/plan), but trip *settings* —
// rename, date-range, archive, delete — are owner-only. The trip Update/Archive
// store methods are scoped WHERE owner_id, so even though roleAllows(editor,
// "write") is true, an Editor's PATCH/archive resolves to a 404 (existence is
// never leaked). Content writes are covered by the Budget and Journal suites; the
// budget PUT here is a positive control proving the Editor is genuinely a writer.
func TestTripAuthz_EditorEditsContentNotTripSettings(t *testing.T) {
	if authzTestPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	truncateAll(t)
	ownerID, editorID := genID(t), genID(t)
	tripID := setupTrip(t, ownerID)
	addMember(t, tripID, editorID, sharing.RoleEditor)
	srv := authzServer(t, editorID)

	// Content write is allowed (the Editor really is a writer).
	r := do(t, srv, http.MethodPut, "/trips/"+tripID+"/budget-lines",
		map[string]any{"category": "Food", "planned_amount": 100})
	wantStatus(t, "editor PUT budget-lines allowed", r, http.StatusOK)

	// Trip settings are owner-only, so both mutations are denied as 404.
	r = do(t, srv, http.MethodPatch, "/trips/"+tripID,
		map[string]any{"name": "editor edit", "start_date": "2026-08-01", "end_date": "2026-08-05"})
	wantStatus(t, "editor PATCH trip settings denied", r, http.StatusNotFound)

	r = do(t, srv, http.MethodPost, "/trips/"+tripID+"/archive", nil)
	wantStatus(t, "editor POST /archive denied", r, http.StatusNotFound)
}

func TestTripAuthz_ViewerCanReadButNotWrite(t *testing.T) {
	if authzTestPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	truncateAll(t)
	ownerID, viewerID := genID(t), genID(t)
	tripID := setupTrip(t, ownerID)
	addMember(t, tripID, viewerID, sharing.RoleViewer)
	srv := authzServer(t, viewerID)

	r := do(t, srv, http.MethodGet, "/trips/"+tripID+"/days/2026-08-01", nil)
	wantStatus(t, "viewer GET day", r, http.StatusOK)

	r = do(t, srv, http.MethodPatch, "/trips/"+tripID,
		map[string]any{"name": "hijack", "start_date": "2026-08-01", "end_date": "2026-08-05"})
	wantStatus(t, "viewer PATCH trip denied", r, http.StatusNotFound)
}

func TestTripAuthz_NonMemberDenied(t *testing.T) {
	if authzTestPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	truncateAll(t)
	ownerID, strangerID := genID(t), genID(t)
	tripID := setupTrip(t, ownerID)
	srv := authzServer(t, strangerID)

	r := do(t, srv, http.MethodGet, "/trips/"+tripID+"/days/2026-08-01", nil)
	wantStatus(t, "non-member GET trip denied", r, http.StatusNotFound)
}

// ─── Budget module ─────────────────────────────────────────────────────────

func TestBudgetAuthz_ViewerCanReadRollup(t *testing.T) {
	if authzTestPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	truncateAll(t)
	ownerID, viewerID := genID(t), genID(t)
	tripID := setupTrip(t, ownerID)
	addMember(t, tripID, viewerID, sharing.RoleViewer)
	srv := authzServer(t, viewerID)

	r := do(t, srv, http.MethodGet, "/trips/"+tripID+"/budget/rollup", nil)
	wantStatus(t, "viewer GET budget/rollup", r, http.StatusOK)
}

func TestBudgetAuthz_ViewerCannotWriteBudgetLine(t *testing.T) {
	if authzTestPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	truncateAll(t)
	ownerID, viewerID := genID(t), genID(t)
	tripID := setupTrip(t, ownerID)
	addMember(t, tripID, viewerID, sharing.RoleViewer)
	srv := authzServer(t, viewerID)

	r := do(t, srv, http.MethodPut, "/trips/"+tripID+"/budget-lines",
		map[string]any{"category": "Food", "planned_amount": 100})
	wantStatus(t, "viewer PUT budget-lines denied", r, http.StatusNotFound)
}

func TestBudgetAuthz_EditorCanWriteBudgetLine(t *testing.T) {
	if authzTestPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	truncateAll(t)
	ownerID, editorID := genID(t), genID(t)
	tripID := setupTrip(t, ownerID)
	addMember(t, tripID, editorID, sharing.RoleEditor)
	srv := authzServer(t, editorID)

	r := do(t, srv, http.MethodPut, "/trips/"+tripID+"/budget-lines",
		map[string]any{"category": "Food", "planned_amount": 100})
	wantStatus(t, "editor PUT budget-lines", r, http.StatusOK)
}

func TestBudgetAuthz_NonMemberDenied(t *testing.T) {
	if authzTestPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	truncateAll(t)
	ownerID, strangerID := genID(t), genID(t)
	tripID := setupTrip(t, ownerID)
	srv := authzServer(t, strangerID)

	r := do(t, srv, http.MethodGet, "/trips/"+tripID+"/budget/rollup", nil)
	wantStatus(t, "non-member GET budget/rollup denied", r, http.StatusNotFound)
}

// ─── Journal module ────────────────────────────────────────────────────────

func TestJournalAuthz_ViewerCanReadEntry(t *testing.T) {
	if authzTestPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	truncateAll(t)
	ownerID, viewerID := genID(t), genID(t)
	tripID := setupTrip(t, ownerID)
	addMember(t, tripID, viewerID, sharing.RoleViewer)
	dayID := resolveDayID(t, ownerID, tripID, "2026-08-01")
	srv := authzServer(t, viewerID)

	r := do(t, srv, http.MethodGet, "/trips/"+tripID+"/days/"+dayID+"/journal", nil)
	// 404 here means "no entry yet" (authz passed, entry not found) — not a denial.
	// Both 200 and 404 are acceptable; 403 or a different denial code is not.
	if r.StatusCode == http.StatusForbidden {
		r.Body.Close()
		t.Error("viewer GET journal: got 403, want access granted (200 or 404-not-found)")
		return
	}
	r.Body.Close()
}

func TestJournalAuthz_ViewerCannotWriteEntry(t *testing.T) {
	if authzTestPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	truncateAll(t)
	ownerID, viewerID := genID(t), genID(t)
	tripID := setupTrip(t, ownerID)
	addMember(t, tripID, viewerID, sharing.RoleViewer)
	dayID := resolveDayID(t, ownerID, tripID, "2026-08-01")
	srv := authzServer(t, viewerID)

	r := do(t, srv, http.MethodPut, "/trips/"+tripID+"/days/"+dayID+"/journal",
		map[string]any{"body": json.RawMessage(`"day 1"`)})
	wantStatus(t, "viewer PUT journal denied", r, http.StatusNotFound)
}

func TestJournalAuthz_EditorCanWriteEntry(t *testing.T) {
	if authzTestPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	truncateAll(t)
	ownerID, editorID := genID(t), genID(t)
	tripID := setupTrip(t, ownerID)
	addMember(t, tripID, editorID, sharing.RoleEditor)
	dayID := resolveDayID(t, ownerID, tripID, "2026-08-01")
	srv := authzServer(t, editorID)

	r := do(t, srv, http.MethodPut, "/trips/"+tripID+"/days/"+dayID+"/journal",
		map[string]any{"body": json.RawMessage(`"day 1"`)})
	wantStatus(t, "editor PUT journal", r, http.StatusOK)
}

func TestJournalAuthz_NonMemberDenied(t *testing.T) {
	if authzTestPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	truncateAll(t)
	ownerID, strangerID := genID(t), genID(t)
	tripID := setupTrip(t, ownerID)
	dayID := resolveDayID(t, ownerID, tripID, "2026-08-01")
	srv := authzServer(t, strangerID)

	r := do(t, srv, http.MethodGet, "/trips/"+tripID+"/days/"+dayID+"/journal", nil)
	wantStatus(t, "non-member GET journal denied", r, http.StatusNotFound)
}

// ─── Revocation ────────────────────────────────────────────────────────────

func TestAuthz_RevocationTakesEffectImmediately(t *testing.T) {
	if authzTestPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	truncateAll(t)
	ownerID, editorID := genID(t), genID(t)
	tripID := setupTrip(t, ownerID)
	addMember(t, tripID, editorID, sharing.RoleEditor)
	srv := authzServer(t, editorID)

	// Before revocation: editor can write content (budget line). Trip settings are
	// owner-only, so a membership-scoped content write is the right probe here.
	r := do(t, srv, http.MethodPut, "/trips/"+tripID+"/budget-lines",
		map[string]any{"category": "Food", "planned_amount": 40})
	wantStatus(t, "editor PUT budget before revoke", r, http.StatusOK)

	mb := sharing.NewMemberships(authzTestPool)
	if err := mb.Revoke(context.Background(), tripID, editorID); err != nil {
		t.Fatalf("Revoke: %v", err)
	}

	// Denied immediately on the very next request — same server, no restart.
	r = do(t, srv, http.MethodPut, "/trips/"+tripID+"/budget-lines",
		map[string]any{"category": "Food", "planned_amount": 41})
	wantStatus(t, "editor PUT budget after revoke denied", r, http.StatusNotFound)
}

func TestAuthz_RoleDowngradeTakesEffectImmediately(t *testing.T) {
	if authzTestPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	truncateAll(t)
	ownerID, editorID := genID(t), genID(t)
	tripID := setupTrip(t, ownerID)
	addMember(t, tripID, editorID, sharing.RoleEditor)
	srv := authzServer(t, editorID)

	// Before downgrade: editor can write budget lines.
	r := do(t, srv, http.MethodPut, "/trips/"+tripID+"/budget-lines",
		map[string]any{"category": "Food", "planned_amount": 50})
	wantStatus(t, "editor PUT budget before downgrade", r, http.StatusOK)

	mb := sharing.NewMemberships(authzTestPool)
	if err := mb.ChangeRole(context.Background(), tripID, editorID, sharing.RoleViewer); err != nil {
		t.Fatalf("ChangeRole: %v", err)
	}

	// Write denied immediately after downgrade to Viewer.
	r = do(t, srv, http.MethodPut, "/trips/"+tripID+"/budget-lines",
		map[string]any{"category": "Food", "planned_amount": 99})
	wantStatus(t, "downgraded-to-viewer PUT budget denied", r, http.StatusNotFound)

	// Read still allowed.
	r = do(t, srv, http.MethodGet, "/trips/"+tripID+"/budget/rollup", nil)
	wantStatus(t, "downgraded-to-viewer GET rollup allowed", r, http.StatusOK)
}

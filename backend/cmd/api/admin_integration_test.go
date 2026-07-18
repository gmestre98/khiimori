//go:build integration

// Admin access-control integration tests (M08.5 S4).
//
// Tests assert that:
//   - Non-admins are denied (403) at every admin endpoint.
//   - Admins can reach the backoffice and perform reads and actions.
//   - Grant / revoke / change-role admin actions work against the real DB.
//   - Deactivating a user via the admin endpoint sets active=false in the DB.
//   - A deactivated user is blocked from auth (RequireAuth returns 401).
//
// Run with:
//
//	DATABASE_URL_TEST=<direct DSN of a throwaway DB> \
//	    go test -tags=integration ./cmd/api/...
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gmestre98/khiimori/backend/internal/auth"
	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
	"github.com/gmestre98/khiimori/backend/internal/platform/config"
	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
	"github.com/gmestre98/khiimori/backend/internal/sharing"
)

// ─── helpers ─────────────────────────────────────────────────────────────────

// insertUser seeds a row into auth.users directly, bypassing the OAuth flow.
// The row is deleted via t.Cleanup.
func insertUser(t *testing.T, email string, isAdmin, active bool) string {
	t.Helper()
	var id string
	// id is a uuid column with a DB default, so it is omitted here and generated
	// server-side; google_sub is text, so gen_random_uuid()::text is fine there.
	// RETURNING id::text renders the uuid back as text for the string scan target.
	err := authzTestPool.QueryRow(context.Background(),
		`INSERT INTO auth.users
		 (google_sub, email, name, avatar, home_base, default_currency, prefs, is_admin, active)
		 VALUES (gen_random_uuid()::text, $1, $1, '', '', 'EUR', '{}', $2, $3)
		 RETURNING id::text`,
		email, isAdmin, active,
	).Scan(&id)
	if err != nil {
		t.Fatalf("insertUser(%s): %v", email, err)
	}
	t.Cleanup(func() {
		_, _ = authzTestPool.Exec(context.Background(),
			`DELETE FROM auth.users WHERE id = $1`, id)
	})
	return id
}

// truncateAuthUsers removes all rows from auth.users (cascades to memberships etc.).
func truncateAuthUsers(t *testing.T) {
	t.Helper()
	_, err := authzTestPool.Exec(context.Background(),
		`TRUNCATE auth.users RESTART IDENTITY CASCADE`)
	if err != nil {
		t.Fatalf("truncateAuthUsers: %v", err)
	}
}

// adminShimRequireAdmin builds a test gate middleware that:
//  1. Reads is_admin for callerID from the real auth.users table.
//  2. Returns 403 if not admin, 401 if the row is not found.
//  3. Injects callerID as the authenticated principal.
//
// This lets integration tests drive admin endpoints without HMAC session cookies.
func adminShimRequireAdmin(callerID string) httpx.Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			var isAdmin bool
			err := authzTestPool.QueryRow(r.Context(),
				`SELECT is_admin FROM auth.users WHERE id = $1`, callerID).Scan(&isAdmin)
			if err != nil {
				httpx.WriteError(w, r, httpx.NewAPIError(
					http.StatusUnauthorized, "auth_required", "authentication required"))
				return
			}
			if !isAdmin {
				httpx.WriteError(w, r, httpx.NewAPIError(
					http.StatusForbidden, "forbidden", "admin access required"))
				return
			}
			ctx := authn.WithPrincipal(r.Context(), authn.Principal{UserID: callerID})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// adminMux builds a ServeMux with both the auth and sharing admin endpoints
// wired to a DB-backed shim gate (no HMAC cookies needed).
func adminMux(callerID string) *http.ServeMux {
	mux := http.NewServeMux()
	gate := adminShimRequireAdmin(callerID)

	authModule := auth.New(config.Config{}, authzTestPool)
	authModule.RegisterAdminRoutes(mux, gate)

	sharing.New(authzTestPool, sharing.Options{
		RequireAdmin: gate,
	}).RegisterRoutes(mux)

	return mux
}

// adminServer wraps adminMux in an httptest.Server.
func adminServer(t *testing.T, callerID string) *httptest.Server {
	t.Helper()
	if authzTestPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	srv := httptest.NewServer(adminMux(callerID))
	t.Cleanup(srv.Close)
	return srv
}

// ─── admin gating ─────────────────────────────────────────────────────────────

// TestAdminGating_NonAdminDenied asserts that every admin endpoint returns 403
// for a non-admin authenticated user.
func TestAdminGating_NonAdminDenied(t *testing.T) {
	if authzTestPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	truncateAuthUsers(t)
	uid := fmt.Sprintf("na-%s", genID(t))
	nonAdminID := insertUser(t, uid+"@example.com", false, true)
	tripID := genID(t)
	userID := genID(t)
	srv := adminServer(t, nonAdminID)

	endpoints := []struct {
		method string
		path   string
		body   any
	}{
		{http.MethodGet, "/admin", nil},
		{http.MethodGet, "/admin/stats", nil},
		{http.MethodGet, "/admin/activity", nil},
		{http.MethodGet, "/admin/users", nil},
		{http.MethodGet, "/admin/trips", nil},
		{http.MethodPost, "/admin/users/" + userID + "/deactivate", nil},
		{http.MethodPost, "/admin/users/" + userID + "/reactivate", nil},
		{http.MethodPost, "/admin/trips/" + tripID + "/members",
			map[string]any{"user_id": userID, "role": "viewer"}},
		{http.MethodPatch, "/admin/trips/" + tripID + "/members/" + userID,
			map[string]any{"role": "editor"}},
		{http.MethodDelete, "/admin/trips/" + tripID + "/members/" + userID, nil},
	}

	for _, e := range endpoints {
		r := do(t, srv, e.method, e.path, e.body)
		if r.StatusCode != http.StatusForbidden {
			r.Body.Close()
			t.Errorf("non-admin %s %s: got %d, want 403", e.method, e.path, r.StatusCode)
		} else {
			r.Body.Close()
		}
	}
}

// TestAdminGating_AdminCanReachBackoffice asserts that an is_admin user can
// reach the read endpoints.
func TestAdminGating_AdminCanReachBackoffice(t *testing.T) {
	if authzTestPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	truncateAuthUsers(t)
	adminID := insertUser(t, "admin-"+genID(t)+"@example.com", true, true)
	srv := adminServer(t, adminID)

	r := do(t, srv, http.MethodGet, "/admin/users", nil)
	wantStatus(t, "admin GET /admin/users", r, http.StatusOK)

	r = do(t, srv, http.MethodGet, "/admin/trips", nil)
	wantStatus(t, "admin GET /admin/trips", r, http.StatusOK)

	r = do(t, srv, http.MethodGet, "/admin/stats", nil)
	wantStatus(t, "admin GET /admin/stats", r, http.StatusOK)
}

// TestAdminStats asserts the aggregate snapshot reflects seeded rows: with one
// admin user and no trips, the counts and a 6-point growth series come back.
func TestAdminStats(t *testing.T) {
	if authzTestPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	truncateAuthUsers(t)
	adminID := insertUser(t, "admin-"+genID(t)+"@example.com", true, true)
	srv := adminServer(t, adminID)

	r := do(t, srv, http.MethodGet, "/admin/stats", nil)
	defer r.Body.Close()
	if r.StatusCode != http.StatusOK {
		t.Fatalf("admin GET /admin/stats: got %d, want 200", r.StatusCode)
	}

	var got struct {
		Users      struct{ Total, Active, Admins int }   `json:"users"`
		Trips      struct{ Total, Active, Archived int } `json:"trips"`
		UserGrowth []struct {
			Month string `json:"month"`
			Count int    `json:"count"`
		} `json:"user_growth"`
	}
	if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
		t.Fatalf("decode stats: %v", err)
	}
	// auth.users was just truncated then seeded with one active admin, so the
	// user counts are exact. trip.trips has no FK to auth.users (see migration
	// 00009), so the truncate doesn't clear trips — assert only that the trip
	// counts are internally consistent, not an absolute total.
	if got.Users.Total != 1 || got.Users.Active != 1 || got.Users.Admins != 1 {
		t.Errorf("users = %+v, want total=1 active=1 admins=1", got.Users)
	}
	if got.Trips.Active+got.Trips.Archived != got.Trips.Total {
		t.Errorf("trips = %+v, want active+archived == total", got.Trips)
	}
	if len(got.UserGrowth) != 6 {
		t.Errorf("user_growth len = %d, want 6 months", len(got.UserGrowth))
	}
}

// ─── grant / revoke / change-role ─────────────────────────────────────────────

// TestAdminGrantRevokeChangeRole covers the full lifecycle of admin trip
// membership management against the real DB.
func TestAdminGrantRevokeChangeRole(t *testing.T) {
	if authzTestPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	truncateAll(t)
	truncateAuthUsers(t)
	adminID := insertUser(t, "admin-"+genID(t)+"@example.com", true, true)
	targetID := insertUser(t, "target-"+genID(t)+"@example.com", false, true)
	ownerID := genID(t)
	tripID := setupTrip(t, ownerID)
	srv := adminServer(t, adminID)

	// Grant viewer access.
	r := do(t, srv, http.MethodPost, "/admin/trips/"+tripID+"/members",
		map[string]any{"user_id": targetID, "role": "viewer"})
	wantStatus(t, "admin grant viewer", r, http.StatusCreated)

	// Change to editor.
	r = do(t, srv, http.MethodPatch, "/admin/trips/"+tripID+"/members/"+targetID,
		map[string]any{"role": "editor"})
	wantStatus(t, "admin change to editor", r, http.StatusNoContent)

	// Verify role in DB.
	mb := sharing.NewMemberships(authzTestPool)
	role, err := mb.RoleForUser(context.Background(), tripID, targetID)
	if err != nil {
		t.Fatalf("RoleForUser after change-role: %v", err)
	}
	if role != sharing.RoleEditor {
		t.Errorf("role = %q after admin change-role, want editor", role)
	}

	// Revoke.
	r = do(t, srv, http.MethodDelete, "/admin/trips/"+tripID+"/members/"+targetID, nil)
	wantStatus(t, "admin revoke", r, http.StatusNoContent)

	// Membership must be gone.
	if _, err := mb.RoleForUser(context.Background(), tripID, targetID); err == nil {
		t.Error("membership still exists after admin revoke")
	}
}

// ─── deactivate user ─────────────────────────────────────────────────────────

// TestAdminDeactivateUser asserts that the deactivate endpoint sets active=false
// in the DB.
func TestAdminDeactivateUser(t *testing.T) {
	if authzTestPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	truncateAuthUsers(t)
	adminID := insertUser(t, "admin-"+genID(t)+"@example.com", true, true)
	targetID := insertUser(t, "target-"+genID(t)+"@example.com", false, true)
	srv := adminServer(t, adminID)

	r := do(t, srv, http.MethodPost, "/admin/users/"+targetID+"/deactivate", nil)
	wantStatus(t, "admin deactivate", r, http.StatusOK)

	var active bool
	if err := authzTestPool.QueryRow(context.Background(),
		`SELECT active FROM auth.users WHERE id = $1`, targetID).Scan(&active); err != nil {
		t.Fatalf("query active after deactivate: %v", err)
	}
	if active {
		t.Error("user is still active=true after admin deactivate")
	}
}

// TestAdminReactivateUser asserts the reactivate endpoint flips active back to
// true after a deactivate.
func TestAdminReactivateUser(t *testing.T) {
	if authzTestPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	truncateAuthUsers(t)
	adminID := insertUser(t, "admin-"+genID(t)+"@example.com", true, true)
	targetID := insertUser(t, "target-"+genID(t)+"@example.com", false, false)
	srv := adminServer(t, adminID)

	r := do(t, srv, http.MethodPost, "/admin/users/"+targetID+"/reactivate", nil)
	wantStatus(t, "admin reactivate", r, http.StatusOK)

	var active bool
	if err := authzTestPool.QueryRow(context.Background(),
		`SELECT active FROM auth.users WHERE id = $1`, targetID).Scan(&active); err != nil {
		t.Fatalf("query active after reactivate: %v", err)
	}
	if !active {
		t.Error("user is still active=false after admin reactivate")
	}
}

// TestAdminActivity asserts the feed includes a sign-up event for a seeded user.
func TestAdminActivity(t *testing.T) {
	if authzTestPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	truncateAuthUsers(t)
	adminID := insertUser(t, "admin-"+genID(t)+"@example.com", true, true)
	srv := adminServer(t, adminID)

	r := do(t, srv, http.MethodGet, "/admin/activity", nil)
	defer r.Body.Close()
	if r.StatusCode != http.StatusOK {
		t.Fatalf("admin GET /admin/activity: got %d, want 200", r.StatusCode)
	}
	var got struct {
		Events []struct {
			Kind  string `json:"kind"`
			Actor string `json:"actor"`
			At    string `json:"at"`
		} `json:"events"`
	}
	if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
		t.Fatalf("decode activity: %v", err)
	}
	var sawSignup bool
	for _, e := range got.Events {
		if e.Kind == "signup" && e.At == "" {
			t.Errorf("signup event has empty timestamp: %+v", e)
		}
		if e.Kind == "signup" {
			sawSignup = true
		}
	}
	if !sawSignup {
		t.Error("activity feed has no signup event for the seeded admin")
	}
}

// TestAdminListUsersEnrichedFields asserts the users list carries the new
// joined + trip_count columns.
func TestAdminListUsersEnrichedFields(t *testing.T) {
	if authzTestPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	truncateAuthUsers(t)
	adminID := insertUser(t, "admin-"+genID(t)+"@example.com", true, true)
	srv := adminServer(t, adminID)

	r := do(t, srv, http.MethodGet, "/admin/users", nil)
	defer r.Body.Close()
	if r.StatusCode != http.StatusOK {
		t.Fatalf("admin GET /admin/users: got %d, want 200", r.StatusCode)
	}
	var users []struct {
		ID        string `json:"id"`
		Joined    string `json:"joined"`
		TripCount int    `json:"trip_count"`
	}
	if err := json.NewDecoder(r.Body).Decode(&users); err != nil {
		t.Fatalf("decode users: %v", err)
	}
	if len(users) != 1 {
		t.Fatalf("users len = %d, want 1", len(users))
	}
	if users[0].Joined == "" {
		t.Error("joined is empty, want a sign-up timestamp")
	}
	if users[0].TripCount != 0 {
		t.Errorf("trip_count = %d, want 0 for a fresh admin", users[0].TripCount)
	}
}

// TestDeactivatedUserBlockedFromAuth asserts that RequireAuth rejects a
// deactivated user with 401 even when a valid HMAC session cookie is present.
// It uses IssueSessionCookie so the test does not need to go through OAuth.
func TestDeactivatedUserBlockedFromAuth(t *testing.T) {
	if authzTestPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	truncateAuthUsers(t)
	targetID := insertUser(t, "target-"+genID(t)+"@example.com", false, true)

	// Build a real auth.Module with a session key so IssueSessionCookie works.
	cfg := config.Config{SessionSecret: "test-integration-key-32bytes-ok!!"}
	authModule := auth.New(cfg, authzTestPool)

	// Issue a valid cookie for targetID.
	cookie, err := authModule.IssueSessionCookie(targetID)
	if err != nil {
		t.Fatalf("IssueSessionCookie: %v", err)
	}

	// Deactivate the user in the DB.
	if _, err := authzTestPool.Exec(context.Background(),
		`UPDATE auth.users SET active = false WHERE id = $1`, targetID); err != nil {
		t.Fatalf("deactivate: %v", err)
	}

	// Build a minimal mux with RequireAuth on a probe endpoint.
	mux := http.NewServeMux()
	mux.Handle("/probe", authModule.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})))

	req := httptest.NewRequest(http.MethodGet, "/probe", nil)
	req.AddCookie(cookie)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("deactivated user with valid cookie: got %d, want 401", rec.Code)
	}
}

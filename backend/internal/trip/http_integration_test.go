//go:build integration

// Integration tests for trip CRUD driven through the HTTP endpoints (M03.1 S5).
// They exercise the full handler → store → DB path — parsing, auth principal
// injection, owner-membership write, and transactional cascade — against a
// migrated schema on a disposable database.
//
// The tests use sqlOwnerMemberships (same SQL as sharing.Memberships) rather
// than importing the sharing module directly: the trip module must not import
// the sharing module (modular-monolith boundary enforced by
// internal/boundaries). The end-to-end path through the real sharing writer is
// validated at the composition-root level.
//
// Gating and harness follow create_integration_test.go. Run with:
//
//	DATABASE_URL_TEST=<direct DSN of a throwaway DB> \
//	    go test -tags=integration ./internal/trip/...
package trip

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
	"github.com/gmestre98/khiimori/backend/internal/platform/httpx"
)

// authShim returns an httpx.Middleware that injects a canned Principal so HTTP
// integration tests can reach handler logic without a real session store.
func authShim(userID string) httpx.Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := authn.WithPrincipal(r.Context(), authn.Principal{UserID: userID})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// newModule wires a real Module with the shared testPool and the SQL membership
// writer, then returns both the module and a fresh httptest.Server. The server
// is registered for cleanup on t.
func newModule(t *testing.T) (*Module, *httptest.Server) {
	t.Helper()
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping trip HTTP integration test")
	}
	_, err := testPool.Exec(context.Background(),
		`TRUNCATE trip.trips, sharing.trip_memberships RESTART IDENTITY`)
	if err != nil {
		t.Fatalf("truncating tables: %v", err)
	}

	store := &pgxTripStore{pool: testPool, memberships: sqlOwnerMemberships{}, days: noopDayRegenerator{}}
	ownerID := freshOwnerID(t)
	mod := &Module{store: store, requireAuth: authShim(ownerID)}

	mux := http.NewServeMux()
	mod.RegisterRoutes(mux)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return mod, srv
}

// freshOwnerID returns a new random UUID to use as the owner across a test.
func freshOwnerID(t *testing.T) string {
	t.Helper()
	var id string
	if err := testPool.QueryRow(context.Background(), `SELECT gen_random_uuid()::text`).Scan(&id); err != nil {
		t.Fatalf("generating owner id: %v", err)
	}
	return id
}

// postJSON fires a POST with a JSON body and returns the response.
func postJSON(t *testing.T, srv *httptest.Server, path string, body any) *http.Response {
	t.Helper()
	b, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshalling request body: %v", err)
	}
	resp, err := http.Post(srv.URL+path, "application/json", bytes.NewReader(b))
	if err != nil {
		t.Fatalf("POST %s: %v", path, err)
	}
	return resp
}

// patchJSON fires a PATCH with a JSON body and returns the response.
func patchJSON(t *testing.T, srv *httptest.Server, path string, body any) *http.Response {
	t.Helper()
	b, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshalling request body: %v", err)
	}
	req, err := http.NewRequest(http.MethodPatch, srv.URL+path, bytes.NewReader(b))
	if err != nil {
		t.Fatalf("building PATCH request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("PATCH %s: %v", path, err)
	}
	return resp
}

// deleteReq fires a DELETE and returns the response.
func deleteReq(t *testing.T, srv *httptest.Server, path string) *http.Response {
	t.Helper()
	req, err := http.NewRequest(http.MethodDelete, srv.URL+path, nil)
	if err != nil {
		t.Fatalf("building DELETE request: %v", err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("DELETE %s: %v", path, err)
	}
	return resp
}

// decodeTrip decodes a tripResponse from resp's body, failing the test on error.
func decodeTrip(t *testing.T, resp *http.Response) tripResponse {
	t.Helper()
	defer resp.Body.Close()
	var tr tripResponse
	if err := json.NewDecoder(resp.Body).Decode(&tr); err != nil {
		t.Fatalf("decoding trip response: %v", err)
	}
	return tr
}

// countRows returns the number of rows matching the query and arg.
func countRows(t *testing.T, query string, arg any) int {
	t.Helper()
	var n int
	if err := testPool.QueryRow(context.Background(), query, arg).Scan(&n); err != nil {
		t.Fatalf("counting rows (%s): %v", query, err)
	}
	return n
}

// TestHTTPCreateWritesTripAndOwnerMembership drives create through the HTTP
// endpoint: asserts 201, the trip fields, EUR/active server-side defaults, and
// that exactly one Owner membership row was written for the creator.
func TestHTTPCreateWritesTripAndOwnerMembership(t *testing.T) {
	_, srv := newModule(t)
	// Retrieve the injected ownerID from the authShim by reading it from the
	// first trip we create — the response includes owner_id.
	body := map[string]any{
		"name":         "Lisbon",
		"destinations": []string{"Lisbon", "Porto"},
		"start_date":   "2026-07-01",
		"end_date":     "2026-07-10",
		"cover":        "https://example.com/cover.jpg",
	}
	resp := postJSON(t, srv, TripsPath, body)
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("POST /trips status = %d, want 201", resp.StatusCode)
	}

	tr := decodeTrip(t, resp)
	if tr.ID == "" {
		t.Error("response trip has no id")
	}
	if tr.BaseCurrency != "EUR" {
		t.Errorf("base_currency = %q, want EUR (server default)", tr.BaseCurrency)
	}
	if tr.Status != "active" {
		t.Errorf("status = %q, want active (server default)", tr.Status)
	}
	if tr.Name != "Lisbon" {
		t.Errorf("name = %q, want Lisbon", tr.Name)
	}
	if tr.StartDate != "2026-07-01" || tr.EndDate != "2026-07-10" {
		t.Errorf("dates = %s / %s, want 2026-07-01 / 2026-07-10", tr.StartDate, tr.EndDate)
	}

	// The Owner membership row must exist with role "owner".
	var role string
	err := testPool.QueryRow(context.Background(),
		`SELECT role FROM sharing.trip_memberships WHERE trip_id = $1::uuid AND user_id = $2::uuid`,
		tr.ID, tr.OwnerID).Scan(&role)
	if err != nil {
		t.Fatalf("querying owner membership: %v", err)
	}
	if role != "owner" {
		t.Errorf("membership role = %q, want owner", role)
	}
}

// TestHTTPCreateValidationRejects400 asserts the endpoint returns 400 when the
// request body fails validation (blank name, end before start).
func TestHTTPCreateValidationRejects400(t *testing.T) {
	_, srv := newModule(t)

	cases := []struct {
		label string
		body  map[string]any
	}{
		{"blank name", map[string]any{
			"name": "", "destinations": []string{}, "start_date": "2026-07-01", "end_date": "2026-07-10", "cover": "",
		}},
		{"end before start", map[string]any{
			"name": "Trip", "destinations": []string{}, "start_date": "2026-07-10", "end_date": "2026-07-01", "cover": "",
		}},
	}

	for _, tc := range cases {
		t.Run(tc.label, func(t *testing.T) {
			resp := postJSON(t, srv, TripsPath, tc.body)
			resp.Body.Close()
			if resp.StatusCode != http.StatusBadRequest {
				t.Errorf("POST /trips status = %d, want 400", resp.StatusCode)
			}
		})
	}
}

// TestHTTPEditUpdatesFieldsViaEndpoint drives edit through the HTTP endpoint:
// asserts 200 and that the updated fields are reflected, while base_currency
// and owner_id remain immutable.
func TestHTTPEditUpdatesFieldsViaEndpoint(t *testing.T) {
	_, srv := newModule(t)

	// Seed a trip via the create endpoint.
	createBody := map[string]any{
		"name":         "Lisbon",
		"destinations": []string{"Lisbon"},
		"start_date":   "2026-07-01",
		"end_date":     "2026-07-10",
		"cover":        "",
	}
	created := decodeTrip(t, postJSON(t, srv, TripsPath, createBody))

	editBody := map[string]any{
		"name":         "Lisbon (revised)",
		"destinations": []string{"Sintra"},
		"start_date":   "2026-07-01",
		"end_date":     "2026-07-10",
		"cover":        "https://example.com/new.jpg",
	}
	resp := patchJSON(t, srv, fmt.Sprintf("%s/%s", TripsPath, created.ID), editBody)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("PATCH /trips/%s status = %d, want 200", created.ID, resp.StatusCode)
	}

	updated := decodeTrip(t, resp)
	if updated.Name != "Lisbon (revised)" {
		t.Errorf("name = %q, want edited", updated.Name)
	}
	if len(updated.Destinations) != 1 || updated.Destinations[0] != "Sintra" {
		t.Errorf("destinations = %v, want [Sintra]", updated.Destinations)
	}
	if updated.BaseCurrency != "EUR" {
		t.Errorf("base_currency = %q, want EUR (immutable)", updated.BaseCurrency)
	}
	if updated.OwnerID != created.OwnerID {
		t.Errorf("owner_id = %q, want unchanged %q", updated.OwnerID, created.OwnerID)
	}
}

// TestHTTPArchiveHidesTripAndUnarchiveRestores drives archive/unarchive through
// the HTTP endpoints: archive → status "archived", unarchive → status "active".
func TestHTTPArchiveHidesTripAndUnarchiveRestores(t *testing.T) {
	_, srv := newModule(t)

	created := decodeTrip(t, postJSON(t, srv, TripsPath, map[string]any{
		"name": "Porto", "destinations": []string{}, "start_date": "2026-08-01", "end_date": "2026-08-05", "cover": "",
	}))

	archResp := postJSON(t, srv, fmt.Sprintf("%s/%s/archive", TripsPath, created.ID), nil)
	if archResp.StatusCode != http.StatusOK {
		t.Fatalf("POST archive status = %d, want 200", archResp.StatusCode)
	}
	archived := decodeTrip(t, archResp)
	if archived.Status != "archived" {
		t.Errorf("status after archive = %q, want archived", archived.Status)
	}

	// Row must still exist (archive retains the row).
	if n := countRows(t, `SELECT count(*) FROM trip.trips WHERE id = $1::uuid`, created.ID); n != 1 {
		t.Errorf("trip rows after archive = %d, want 1 (retained)", n)
	}

	unarchResp := postJSON(t, srv, fmt.Sprintf("%s/%s/unarchive", TripsPath, created.ID), nil)
	if unarchResp.StatusCode != http.StatusOK {
		t.Fatalf("POST unarchive status = %d, want 200", unarchResp.StatusCode)
	}
	restored := decodeTrip(t, unarchResp)
	if restored.Status != "active" {
		t.Errorf("status after unarchive = %q, want active", restored.Status)
	}
}

// TestHTTPDeleteCascadesMembershipsTransactionally drives delete through the
// HTTP endpoint: asserts 204, and then that both the trip row and its
// membership rows are gone (counts go to zero — no orphans).
func TestHTTPDeleteCascadesMembershipsTransactionally(t *testing.T) {
	_, srv := newModule(t)

	created := decodeTrip(t, postJSON(t, srv, TripsPath, map[string]any{
		"name": "Berlin", "destinations": []string{}, "start_date": "2026-09-01", "end_date": "2026-09-07", "cover": "",
	}))

	resp := deleteReq(t, srv, fmt.Sprintf("%s/%s", TripsPath, created.ID))
	resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("DELETE /trips/%s status = %d, want 204", created.ID, resp.StatusCode)
	}

	if n := countRows(t, `SELECT count(*) FROM trip.trips WHERE id = $1::uuid`, created.ID); n != 0 {
		t.Errorf("trip rows after delete = %d, want 0", n)
	}
	if n := countRows(t, `SELECT count(*) FROM sharing.trip_memberships WHERE trip_id = $1::uuid`, created.ID); n != 0 {
		t.Errorf("membership rows after delete = %d, want 0 (cascade must clean up)", n)
	}
}

// TestHTTPDeleteReturns404ForOtherOwner asserts that deleting a trip owned by
// someone else returns 404 and leaves the trip and its memberships intact.
func TestHTTPDeleteReturns404ForOtherOwner(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	_, err := testPool.Exec(context.Background(),
		`TRUNCATE trip.trips, sharing.trip_memberships RESTART IDENTITY`)
	if err != nil {
		t.Fatalf("truncating tables: %v", err)
	}

	// Two separate modules / auth shims — one per owner.
	ownerA := freshOwnerID(t)
	ownerB := freshOwnerID(t)

	storeA := &pgxTripStore{pool: testPool, memberships: sqlOwnerMemberships{}, days: noopDayRegenerator{}}
	modA := &Module{store: storeA, requireAuth: authShim(ownerA)}
	muxA := http.NewServeMux()
	modA.RegisterRoutes(muxA)
	srvA := httptest.NewServer(muxA)
	t.Cleanup(srvA.Close)

	storeB := &pgxTripStore{pool: testPool, memberships: sqlOwnerMemberships{}, days: noopDayRegenerator{}}
	modB := &Module{store: storeB, requireAuth: authShim(ownerB)}
	muxB := http.NewServeMux()
	modB.RegisterRoutes(muxB)
	srvB := httptest.NewServer(muxB)
	t.Cleanup(srvB.Close)

	// Owner A creates a trip.
	created := decodeTrip(t, postJSON(t, srvA, TripsPath, map[string]any{
		"name": "Rome", "destinations": []string{}, "start_date": "2026-10-01", "end_date": "2026-10-05", "cover": "",
	}))

	// Owner B tries to delete A's trip — must get 404.
	resp := deleteReq(t, srvB, fmt.Sprintf("%s/%s", TripsPath, created.ID))
	resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("DELETE by non-owner status = %d, want 404", resp.StatusCode)
	}

	// Trip and membership must be intact.
	if n := countRows(t, `SELECT count(*) FROM trip.trips WHERE id = $1::uuid`, created.ID); n != 1 {
		t.Errorf("trip rows = %d, want 1 (non-owner delete must not remove it)", n)
	}
	if n := countRows(t, `SELECT count(*) FROM sharing.trip_memberships WHERE trip_id = $1::uuid`, created.ID); n != 1 {
		t.Errorf("membership rows = %d, want 1 (non-owner delete must not remove memberships)", n)
	}
}

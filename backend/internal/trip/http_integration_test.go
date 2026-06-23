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
	"time"

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

// newModuleWithOwnerAt wires a real Module authenticated as ownerID, truncates
// the trip tables so each test starts clean, and returns a ready httptest.Server
// registered for cleanup on t. now is injected as the module clock so bucketing
// tests remain deterministic regardless of when they run.
func newModuleWithOwnerAt(t *testing.T, ownerID string, now func() time.Time) *httptest.Server {
	t.Helper()
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping trip HTTP integration test")
	}
	_, err := testPool.Exec(context.Background(),
		`TRUNCATE trip.plan_items, trip.stays, trip.days, trip.trips, sharing.trip_memberships RESTART IDENTITY`)
	if err != nil {
		t.Fatalf("truncating tables: %v", err)
	}
	store := &pgxTripStore{pool: testPool, memberships: sqlOwnerMemberships{}, days: pgxDayRegenerator{guard: noDayData{}}}
	mod := &Module{store: store, stays: &pgxStayStore{pool: testPool}, planItems: &pgxPlanItemStore{pool: testPool}, requireAuth: authShim(ownerID), authz: NewOwnerOnlyAuthorizer(testPool), now: now}
	mux := http.NewServeMux()
	mod.RegisterRoutes(mux)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

// newModuleWithOwner wires a real Module authenticated as ownerID using the
// wall clock. Use newModuleWithOwnerAt for tests that need bucketing
// assertions with a fixed reference date.
func newModuleWithOwner(t *testing.T, ownerID string) *httptest.Server {
	t.Helper()
	return newModuleWithOwnerAt(t, ownerID, time.Now)
}

// newModule is a convenience wrapper for tests that only need one owner.
func newModule(t *testing.T) *httptest.Server {
	t.Helper()
	return newModuleWithOwner(t, freshOwnerID(t))
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

// httpDelete fires a DELETE against the httptest server and returns the response.
func httpDelete(t *testing.T, srv *httptest.Server, path string) *http.Response {
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
	srv := newModule(t)
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
	srv := newModule(t)

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
	srv := newModule(t)

	// Seed a trip via the create endpoint.
	createBody := map[string]any{
		"name":         "Lisbon",
		"destinations": []string{"Lisbon"},
		"start_date":   "2026-07-01",
		"end_date":     "2026-07-10",
		"cover":        "",
	}
	seedResp := postJSON(t, srv, TripsPath, createBody)
	if seedResp.StatusCode != http.StatusCreated {
		seedResp.Body.Close()
		t.Fatalf("seed POST /trips status = %d, want 201", seedResp.StatusCode)
	}
	created := decodeTrip(t, seedResp)

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
	srv := newModule(t)

	seedResp := postJSON(t, srv, TripsPath, map[string]any{
		"name": "Porto", "destinations": []string{}, "start_date": "2026-08-01", "end_date": "2026-08-05", "cover": "",
	})
	if seedResp.StatusCode != http.StatusCreated {
		seedResp.Body.Close()
		t.Fatalf("seed POST /trips status = %d, want 201", seedResp.StatusCode)
	}
	created := decodeTrip(t, seedResp)

	archResp := postJSON(t, srv, fmt.Sprintf("%s/%s/archive", TripsPath, created.ID), map[string]any{})
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

	unarchResp := postJSON(t, srv, fmt.Sprintf("%s/%s/unarchive", TripsPath, created.ID), map[string]any{})
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
	srv := newModule(t)

	seedResp := postJSON(t, srv, TripsPath, map[string]any{
		"name": "Berlin", "destinations": []string{}, "start_date": "2026-09-01", "end_date": "2026-09-07", "cover": "",
	})
	if seedResp.StatusCode != http.StatusCreated {
		seedResp.Body.Close()
		t.Fatalf("seed POST /trips status = %d, want 201", seedResp.StatusCode)
	}
	created := decodeTrip(t, seedResp)

	resp := httpDelete(t, srv, fmt.Sprintf("%s/%s", TripsPath, created.ID))
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
		t.Skip("DATABASE_URL_TEST not set; skipping trip HTTP integration test")
	}
	// Truncate once up-front; build two servers sharing the same pool, each
	// authenticated as a different owner. newModuleWithOwner is not used for
	// srvB to avoid a second truncate that would wipe srvA's data.
	_, err := testPool.Exec(context.Background(),
		`TRUNCATE trip.plan_items, trip.stays, trip.days, trip.trips, sharing.trip_memberships RESTART IDENTITY`)
	if err != nil {
		t.Fatalf("truncating tables: %v", err)
	}
	ownerA := freshOwnerID(t)
	ownerB := freshOwnerID(t)

	makeServer := func(ownerID string) *httptest.Server {
		store := &pgxTripStore{pool: testPool, memberships: sqlOwnerMemberships{}, days: pgxDayRegenerator{guard: noDayData{}}}
		mod := &Module{store: store, stays: &pgxStayStore{pool: testPool}, planItems: &pgxPlanItemStore{pool: testPool}, requireAuth: authShim(ownerID), authz: NewOwnerOnlyAuthorizer(testPool), now: time.Now}
		mux := http.NewServeMux()
		mod.RegisterRoutes(mux)
		srv := httptest.NewServer(mux)
		t.Cleanup(srv.Close)
		return srv
	}
	srvA := makeServer(ownerA)
	srvB := makeServer(ownerB)

	// Owner A creates a trip.
	seedResp := postJSON(t, srvA, TripsPath, map[string]any{
		"name": "Rome", "destinations": []string{}, "start_date": "2026-10-01", "end_date": "2026-10-05", "cover": "",
	})
	if seedResp.StatusCode != http.StatusCreated {
		seedResp.Body.Close()
		t.Fatalf("seed POST /trips status = %d, want 201", seedResp.StatusCode)
	}
	created := decodeTrip(t, seedResp)

	// Owner B tries to delete A's trip — must get 404.
	resp := httpDelete(t, srvB, fmt.Sprintf("%s/%s", TripsPath, created.ID))
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

// httpGet issues an authenticated GET request to srv at path and returns the
// response. The auth principal is injected via the authShim middleware registered
// on the server.
func httpGet(t *testing.T, srv *httptest.Server, path string) *http.Response {
	t.Helper()
	req, err := http.NewRequest(http.MethodGet, srv.URL+path, nil)
	if err != nil {
		t.Fatalf("building GET request: %v", err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("GET %s: %v", path, err)
	}
	return resp
}

// TestHTTPGetDayAddressability asserts that a created trip's individual days are
// addressable via GET /trips/{id}/days/{date}: the response carries the correct
// id, trip_id, date, and 0-based index; and that a non-existent date is a 404.
// This exercises the deep-linking surface required by Milestones 04–07 (AC4).
func TestHTTPGetDayAddressability(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping")
	}
	srv := newModule(t)

	// Create a 3-day trip: 2026-09-01 → 2026-09-03.
	body := map[string]any{
		"name":       "Addressability test",
		"start_date": "2026-09-01",
		"end_date":   "2026-09-03",
	}
	createResp := postJSON(t, srv, TripsPath, body)
	if createResp.StatusCode != http.StatusCreated {
		createResp.Body.Close()
		t.Fatalf("create trip status = %d, want 201", createResp.StatusCode)
	}
	trip := decodeTrip(t, createResp)

	// Each of the 3 dates must be reachable and carry the correct index.
	dates := []struct {
		date  string
		index int
	}{
		{"2026-09-01", 0},
		{"2026-09-02", 1},
		{"2026-09-03", 2},
	}
	for _, tc := range dates {
		path := fmt.Sprintf("%s/%s/days/%s", TripsPath, trip.ID, tc.date)
		resp := httpGet(t, srv, path)
		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			t.Fatalf("GET %s status = %d, want 200", path, resp.StatusCode)
		}
		var day dayResponse
		if err := json.NewDecoder(resp.Body).Decode(&day); err != nil {
			resp.Body.Close()
			t.Fatalf("decoding day %s: %v", tc.date, err)
		}
		resp.Body.Close()
		if day.TripID != trip.ID {
			t.Errorf("day %s: trip_id = %q, want %q", tc.date, day.TripID, trip.ID)
		}
		if day.Date != tc.date {
			t.Errorf("day %s: date = %q, want %q", tc.date, day.Date, tc.date)
		}
		if day.Index != tc.index {
			t.Errorf("day %s: index = %d, want %d", tc.date, day.Index, tc.index)
		}
		if day.ID == "" {
			t.Errorf("day %s: id is empty", tc.date)
		}
	}

	// A date outside the trip range must be 404.
	path := fmt.Sprintf("%s/%s/days/2026-08-31", TripsPath, trip.ID)
	resp := httpGet(t, srv, path)
	resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("GET out-of-range day status = %d, want 404", resp.StatusCode)
	}
}

// TestHTTPGetDayOtherOwnerIs404 asserts that a day belonging to another user's
// trip is a 404 (owner-scoped; never leaks existence).
func TestHTTPGetDayOtherOwnerIs404(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping")
	}
	ownerA := freshOwnerID(t)
	ownerB := freshOwnerID(t)

	// Use separate servers so each carries its own auth principal.
	makeServer := func(ownerID string) *httptest.Server {
		store := &pgxTripStore{pool: testPool, memberships: sqlOwnerMemberships{}, days: pgxDayRegenerator{guard: noDayData{}}}
		mod := &Module{store: store, stays: &pgxStayStore{pool: testPool}, planItems: &pgxPlanItemStore{pool: testPool}, requireAuth: authShim(ownerID), authz: NewOwnerOnlyAuthorizer(testPool), now: time.Now}
		mux := http.NewServeMux()
		mod.RegisterRoutes(mux)
		srv := httptest.NewServer(mux)
		t.Cleanup(srv.Close)
		return srv
	}
	srvA := makeServer(ownerA)
	srvB := makeServer(ownerB)

	// Owner A creates a trip.
	body := map[string]any{"name": "A's trip", "start_date": "2026-09-10", "end_date": "2026-09-10"}
	createResp := postJSON(t, srvA, TripsPath, body)
	if createResp.StatusCode != http.StatusCreated {
		createResp.Body.Close()
		t.Fatalf("create trip status = %d, want 201", createResp.StatusCode)
	}
	trip := decodeTrip(t, createResp)

	// Owner B must get 404 when addressing A's day.
	path := fmt.Sprintf("%s/%s/days/2026-09-10", TripsPath, trip.ID)
	resp := httpGet(t, srvB, path)
	resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("GET other-owner day status = %d, want 404", resp.StatusCode)
	}
}

// listRef is the fixed reference date used by TestHTTPListBucketsAndScope so
// bucketing assertions remain stable regardless of when the test runs. Trip
// dates below are chosen relative to this anchor.
var listRef = time.Date(2026, 6, 23, 12, 0, 0, 0, time.UTC)

// TestHTTPListBucketsAndScope verifies GET /trips end-to-end: creates trips in
// different time ranges and one archived trip, calls GET /trips, and asserts
// correct bucketing, is_current flag, and exclusion of the archived trip. Also
// asserts owner-scoping: a second owner's trips must not appear in owner A's
// list. A fixed reference date is injected into the module clock so the test is
// deterministic regardless of when it runs.
func TestHTTPListBucketsAndScope(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping")
	}
	_, err := testPool.Exec(context.Background(),
		`TRUNCATE trip.plan_items, trip.stays, trip.days, trip.trips, sharing.trip_memberships RESTART IDENTITY`)
	if err != nil {
		t.Fatalf("truncate: %v", err)
	}

	ownerA := freshOwnerID(t)
	ownerB := freshOwnerID(t)

	fixedClock := func() time.Time { return listRef }
	makeServer := func(ownerID string) *httptest.Server {
		store := &pgxTripStore{pool: testPool, memberships: sqlOwnerMemberships{}, days: pgxDayRegenerator{guard: noDayData{}}}
		mod := &Module{store: store, requireAuth: authShim(ownerID), authz: NewOwnerOnlyAuthorizer(testPool), now: fixedClock}
		mux := http.NewServeMux()
		mod.RegisterRoutes(mux)
		srv := httptest.NewServer(mux)
		t.Cleanup(srv.Close)
		return srv
	}
	srvA := makeServer(ownerA)
	srvB := makeServer(ownerB)

	create := func(srv *httptest.Server, name, start, end string) tripResponse {
		t.Helper()
		resp := postJSON(t, srv, TripsPath, map[string]any{"name": name, "start_date": start, "end_date": end})
		if resp.StatusCode != http.StatusCreated {
			resp.Body.Close()
			t.Fatalf("create %q: status %d", name, resp.StatusCode)
		}
		return decodeTrip(t, resp)
	}

	// Trip dates are chosen relative to listRef (2026-06-23) so the bucketing
	// is fixed: past ends before that date, current spans it, upcoming starts
	// after it.
	past := create(srvA, "Past", "2026-05-01", "2026-05-10")
	current := create(srvA, "Current", "2026-06-20", "2026-06-30")
	upcoming := create(srvA, "Upcoming", "2026-07-01", "2026-07-10")
	archived := create(srvA, "Archived", "2026-04-01", "2026-04-05")

	// Archive the "archived" trip.
	archiveResp, err := http.Post(srvA.URL+TripsPath+"/"+archived.ID+"/archive", "application/json", nil)
	if err != nil {
		t.Fatalf("archive: %v", err)
	}
	archiveResp.Body.Close()
	if archiveResp.StatusCode != http.StatusOK {
		t.Fatalf("archive status = %d, want 200", archiveResp.StatusCode)
	}

	// Owner B creates a trip — must not appear in A's list.
	create(srvB, "B Trip", "2026-06-20", "2026-06-25")

	// Call GET /trips as owner A.
	listResp := httpGet(t, srvA, TripsPath)
	if listResp.StatusCode != http.StatusOK {
		listResp.Body.Close()
		t.Fatalf("GET /trips status = %d, want 200", listResp.StatusCode)
	}
	defer listResp.Body.Close()

	var body listResponse
	if err := json.NewDecoder(listResp.Body).Decode(&body); err != nil {
		t.Fatalf("decode list response: %v", err)
	}

	// Past bucket: exactly the past trip.
	if len(body.Past) != 1 || body.Past[0].ID != past.ID {
		t.Errorf("past = %v, want [%s]", body.Past, past.ID)
	}
	if body.Past[0].IsCurrent {
		t.Error("past trip should have is_current=false")
	}

	// Current bucket: exactly the current trip, flagged.
	if len(body.Current) != 1 || body.Current[0].ID != current.ID {
		t.Errorf("current = %v, want [%s]", body.Current, current.ID)
	}
	if !body.Current[0].IsCurrent {
		t.Error("current trip should have is_current=true")
	}

	// Upcoming bucket: exactly the upcoming trip.
	if len(body.Upcoming) != 1 || body.Upcoming[0].ID != upcoming.ID {
		t.Errorf("upcoming = %v, want [%s]", body.Upcoming, upcoming.ID)
	}

	// Archived trip must not appear anywhere.
	allIDs := make(map[string]bool)
	for _, lt := range append(append(body.Current, body.Upcoming...), body.Past...) {
		allIDs[lt.ID] = true
	}
	if allIDs[archived.ID] {
		t.Errorf("archived trip %s must not appear in the listing", archived.ID)
	}

	// Owner B's trip must not appear.
	for _, lt := range append(append(body.Current, body.Upcoming...), body.Past...) {
		if lt.OwnerID == ownerB {
			t.Errorf("owner B's trip %s appeared in owner A's list", lt.ID)
		}
	}
}

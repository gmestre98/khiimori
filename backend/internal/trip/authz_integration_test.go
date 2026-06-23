//go:build integration

// Integration tests for S4 — authorization enforcement across all trip
// read/write endpoints (M03.4 AC4). Tests run through the full HTTP handler →
// authz → store → DB path so session-derived identity and the Authorizer are
// exercised together.
//
// Behaviour contract documented here: the API returns 404, not 403, when a
// non-owner attempts to access a trip they do not own. This deliberate choice
// avoids a "presence oracle" attack where a caller can distinguish "trip does
// not exist" from "trip exists but I'm not authorised" by comparing status
// codes. See checkAccess in authz_check.go.
//
// Tests are written in terms of observable behaviour (status codes, DB counts),
// not shim internals, so they keep passing when Milestone 08 replaces
// OwnerOnlyAuthorizer with the full membership-based Authorizer.
package trip

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// makeServerAs builds an httptest.Server sharing testPool, authenticated as
// ownerID, without truncating tables. Callers are responsible for truncation
// so they can reuse data between servers in the same test.
func makeServerAs(t *testing.T, ownerID string) *httptest.Server {
	t.Helper()
	store := &pgxTripStore{pool: testPool, memberships: sqlOwnerMemberships{}, days: pgxDayRegenerator{guard: noDayData{}}}
	mod := &Module{store: store, requireAuth: authShim(ownerID), authz: NewOwnerOnlyAuthorizer(testPool), now: time.Now}
	mux := http.NewServeMux()
	mod.RegisterRoutes(mux)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

// setupTwoOwners truncates tables, creates two fresh owner UUIDs, and returns
// their IDs along with an httptest.Server for each.
func setupTwoOwners(t *testing.T) (ownerA, ownerB string, srvA, srvB *httptest.Server) {
	t.Helper()
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping integration test")
	}
	if _, err := testPool.Exec(context.Background(),
		`TRUNCATE trip.days, trip.trips, sharing.trip_memberships RESTART IDENTITY`); err != nil {
		t.Fatalf("truncating tables: %v", err)
	}
	ownerA = freshOwnerID(t)
	ownerB = freshOwnerID(t)
	srvA = makeServerAs(t, ownerA)
	srvB = makeServerAs(t, ownerB)
	return
}

// createTripFor creates a trip via srvA's POST /trips endpoint, failing the test
// if the response is not 201. Returns the decoded tripResponse.
func createTripFor(t *testing.T, srv *httptest.Server, name string) tripResponse {
	t.Helper()
	resp := postJSON(t, srv, TripsPath, map[string]any{
		"name": name, "start_date": "2026-07-01", "end_date": "2026-07-05",
	})
	if resp.StatusCode != http.StatusCreated {
		resp.Body.Close()
		t.Fatalf("create %q: status %d, want 201", name, resp.StatusCode)
	}
	return decodeTrip(t, resp)
}

// TestAuthzOwnerCanPerformAllOperations is the owner-allowed half of the authz
// contract: owner can create, update, archive, unarchive, and delete their trip
// through the HTTP endpoints with auth middleware active.
func TestAuthzOwnerCanPerformAllOperations(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping integration test")
	}
	srv := newModule(t)

	// Create.
	created := createTripFor(t, srv, "Owner ops test")

	// Update.
	patchResp := patchJSON(t, srv, fmt.Sprintf("%s/%s", TripsPath, created.ID), map[string]any{
		"name": "Owner ops test (updated)", "start_date": "2026-07-01", "end_date": "2026-07-05",
	})
	patchResp.Body.Close()
	if patchResp.StatusCode != http.StatusOK {
		t.Errorf("PATCH by owner: status %d, want 200", patchResp.StatusCode)
	}

	// Archive.
	archResp := postJSON(t, srv, fmt.Sprintf("%s/%s/archive", TripsPath, created.ID), map[string]any{})
	archResp.Body.Close()
	if archResp.StatusCode != http.StatusOK {
		t.Errorf("POST /archive by owner: status %d, want 200", archResp.StatusCode)
	}

	// Unarchive.
	unarchResp := postJSON(t, srv, fmt.Sprintf("%s/%s/unarchive", TripsPath, created.ID), map[string]any{})
	unarchResp.Body.Close()
	if unarchResp.StatusCode != http.StatusOK {
		t.Errorf("POST /unarchive by owner: status %d, want 200", unarchResp.StatusCode)
	}

	// Delete.
	delResp := httpDelete(t, srv, fmt.Sprintf("%s/%s", TripsPath, created.ID))
	delResp.Body.Close()
	if delResp.StatusCode != http.StatusNoContent {
		t.Errorf("DELETE by owner: status %d, want 204", delResp.StatusCode)
	}
}

// TestAuthzNonOwnerUpdateDenied asserts that a non-owner's PATCH request is
// denied with 404 (not 403) and leaves the trip data unchanged. The 404 is
// deliberate: it prevents callers from distinguishing "trip does not exist"
// from "trip exists but you're not authorized" (presence oracle attack).
func TestAuthzNonOwnerUpdateDenied(t *testing.T) {
	_, _, srvA, srvB := setupTwoOwners(t)

	trip := createTripFor(t, srvA, "Owner A trip")

	resp := patchJSON(t, srvB, fmt.Sprintf("%s/%s", TripsPath, trip.ID), map[string]any{
		"name": "hijacked", "start_date": "2026-07-01", "end_date": "2026-07-05",
	})
	resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("PATCH by non-owner: status %d, want 404 (presence oracle protection)", resp.StatusCode)
	}

	// Trip name must be unchanged in the DB.
	var storedName string
	if err := testPool.QueryRow(context.Background(),
		`SELECT name FROM trip.trips WHERE id = $1::uuid`, trip.ID).Scan(&storedName); err != nil {
		t.Fatalf("reading trip name: %v", err)
	}
	if storedName != "Owner A trip" {
		t.Errorf("trip name = %q after non-owner PATCH, want unchanged %q", storedName, "Owner A trip")
	}
}

// TestAuthzNonOwnerArchiveDenied asserts that a non-owner's archive request
// returns 404 and leaves the trip's status unchanged.
func TestAuthzNonOwnerArchiveDenied(t *testing.T) {
	_, _, srvA, srvB := setupTwoOwners(t)

	trip := createTripFor(t, srvA, "Owner A trip for archive test")

	resp := postJSON(t, srvB, fmt.Sprintf("%s/%s/archive", TripsPath, trip.ID), map[string]any{})
	resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("POST /archive by non-owner: status %d, want 404", resp.StatusCode)
	}

	// Trip must still be active in the DB.
	var status string
	if err := testPool.QueryRow(context.Background(),
		`SELECT status FROM trip.trips WHERE id = $1::uuid`, trip.ID).Scan(&status); err != nil {
		t.Fatalf("reading trip status: %v", err)
	}
	if status != "active" {
		t.Errorf("trip status = %q after non-owner archive, want active", status)
	}
}

// TestAuthzNonOwnerUnarchiveDenied asserts that a non-owner's unarchive request
// returns 404 and leaves the trip's status unchanged.
func TestAuthzNonOwnerUnarchiveDenied(t *testing.T) {
	_, _, srvA, srvB := setupTwoOwners(t)

	trip := createTripFor(t, srvA, "Owner A trip for unarchive test")

	// Archive the trip first so it is in archived state.
	archResp := postJSON(t, srvA, fmt.Sprintf("%s/%s/archive", TripsPath, trip.ID), map[string]any{})
	archResp.Body.Close()
	if archResp.StatusCode != http.StatusOK {
		t.Fatalf("archiving trip: status %d", archResp.StatusCode)
	}

	resp := postJSON(t, srvB, fmt.Sprintf("%s/%s/unarchive", TripsPath, trip.ID), map[string]any{})
	resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("POST /unarchive by non-owner: status %d, want 404", resp.StatusCode)
	}

	// Trip must still be archived in the DB.
	var status string
	if err := testPool.QueryRow(context.Background(),
		`SELECT status FROM trip.trips WHERE id = $1::uuid`, trip.ID).Scan(&status); err != nil {
		t.Fatalf("reading trip status: %v", err)
	}
	if status != "archived" {
		t.Errorf("trip status = %q after non-owner unarchive, want archived", status)
	}
}

// TestAuthzListOnlyShowsOwnTrips asserts that GET /trips returns only the
// requesting user's trips: owner B's trip must not appear in owner A's listing.
func TestAuthzListOnlyShowsOwnTrips(t *testing.T) {
	ownerA, ownerB, srvA, srvB := setupTwoOwners(t)

	tripA := createTripFor(t, srvA, "A's trip")
	tripB := createTripFor(t, srvB, "B's trip")

	// Owner A's listing must contain tripA and not tripB.
	listA := httpGet(t, srvA, TripsPath)
	if listA.StatusCode != http.StatusOK {
		listA.Body.Close()
		t.Fatalf("GET /trips for owner A: status %d", listA.StatusCode)
	}
	var bodyA listResponse
	if err := decodeJSON(t, listA, &bodyA); err != nil {
		t.Fatalf("decode list for A: %v", err)
	}
	assertContainsTrip(t, "owner A list", tripA.ID, bodyA)
	assertAbsentTrip(t, "owner A list", tripB.ID, ownerB, bodyA)

	// Owner B's listing must contain tripB and not tripA.
	listB := httpGet(t, srvB, TripsPath)
	if listB.StatusCode != http.StatusOK {
		listB.Body.Close()
		t.Fatalf("GET /trips for owner B: status %d", listB.StatusCode)
	}
	var bodyB listResponse
	if err := decodeJSON(t, listB, &bodyB); err != nil {
		t.Fatalf("decode list for B: %v", err)
	}
	assertContainsTrip(t, "owner B list", tripB.ID, bodyB)
	assertAbsentTrip(t, "owner B list", tripA.ID, ownerA, bodyB)
}

// decodeJSON decodes a JSON response body into v. It closes the body after reading.
func decodeJSON(t *testing.T, resp *http.Response, v any) error {
	t.Helper()
	defer resp.Body.Close()
	return json.NewDecoder(resp.Body).Decode(v)
}

// assertContainsTrip fails the test if tripID is not found in any bucket of body.
func assertContainsTrip(t *testing.T, label, tripID string, body listResponse) {
	t.Helper()
	all := append(append(body.Current, body.Upcoming...), body.Past...)
	for _, lt := range all {
		if lt.ID == tripID {
			return
		}
	}
	t.Errorf("%s: expected trip %s to be present, but it was absent", label, tripID)
}

// assertAbsentTrip fails the test if tripID (owned by ownerID) appears in any
// bucket of body.
func assertAbsentTrip(t *testing.T, label, tripID, ownerID string, body listResponse) {
	t.Helper()
	all := append(append(body.Current, body.Upcoming...), body.Past...)
	for _, lt := range all {
		if lt.ID == tripID || lt.OwnerID == ownerID {
			t.Errorf("%s: trip %s (owner %s) must not appear", label, tripID, ownerID)
		}
	}
}

//go:build integration

// Integration tests for Stay CRUD (M04.1 S2). They drive the full handler →
// pgxStayStore → DB path through the HTTP server, covering create, edit,
// delete, and authorization denial against a migrated schema.
//
// Run with:
//
//	DATABASE_URL_TEST=<direct DSN> go test -tags=integration ./internal/trip/...
package trip

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

// createTripForStayTest creates a trip owned by the server's principal and
// returns its id. Fails fast on unexpected status.
func createTripForStayTest(t *testing.T, srv *httptest.Server) string {
	t.Helper()
	body := `{"name":"Stay Test Trip","start_date":"2026-08-01","end_date":"2026-08-07"}`
	resp, err := http.Post(srv.URL+TripsPath, "application/json", bytes.NewBufferString(body))
	if err != nil {
		t.Fatalf("create trip: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create trip status = %d, want 201", resp.StatusCode)
	}
	var tr tripResponse
	if err := json.NewDecoder(resp.Body).Decode(&tr); err != nil {
		t.Fatalf("decode trip: %v", err)
	}
	return tr.ID
}

// TestStayCRUDIntegration exercises the full add/edit/delete path through the
// HTTP server → pgxStayStore → real Neon DB.
func TestStayCRUDIntegration(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping stay integration test")
	}

	srv := newModule(t)
	tripID := createTripForStayTest(t, srv)

	// ── Create (name-only) ─────────────────────────────────────────────────
	createBody := `{"name":"Lisbon Hostel"}`
	resp, err := http.Post(
		fmt.Sprintf("%s%s/%s/stays", srv.URL, TripsPath, tripID),
		"application/json",
		bytes.NewBufferString(createBody),
	)
	if err != nil {
		t.Fatalf("create stay: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create stay status = %d, want 201", resp.StatusCode)
	}
	var st stayResponse
	if err := json.NewDecoder(resp.Body).Decode(&st); err != nil {
		t.Fatalf("decode stay: %v", err)
	}
	if st.ID == "" {
		t.Fatal("created stay has no id")
	}
	if st.Name != "Lisbon Hostel" {
		t.Errorf("name = %q, want Lisbon Hostel", st.Name)
	}
	if st.TripID != tripID {
		t.Errorf("trip_id = %q, want %q", st.TripID, tripID)
	}
	stayID := st.ID

	// ── Create with all fields ─────────────────────────────────────────────
	fullBody := `{"name":"Grand Hotel","location":"Porto","check_in":"2026-08-02","check_out":"2026-08-05","cost":250.00,"link":"https://example.com/hotel"}`
	resp2, err := http.Post(
		fmt.Sprintf("%s%s/%s/stays", srv.URL, TripsPath, tripID),
		"application/json",
		bytes.NewBufferString(fullBody),
	)
	if err != nil {
		t.Fatalf("create full stay: %v", err)
	}
	defer resp2.Body.Close()
	if resp2.StatusCode != http.StatusCreated {
		t.Fatalf("create full stay status = %d, want 201", resp2.StatusCode)
	}
	var st2 stayResponse
	if err := json.NewDecoder(resp2.Body).Decode(&st2); err != nil {
		t.Fatalf("decode full stay: %v", err)
	}
	if st2.CheckIn != "2026-08-02" {
		t.Errorf("check_in = %q, want 2026-08-02", st2.CheckIn)
	}
	if st2.CheckOut != "2026-08-05" {
		t.Errorf("check_out = %q, want 2026-08-05", st2.CheckOut)
	}

	// ── Edit ───────────────────────────────────────────────────────────────
	patchReq, err := http.NewRequest(http.MethodPatch,
		fmt.Sprintf("%s%s/%s/stays/%s", srv.URL, TripsPath, tripID, stayID),
		bytes.NewBufferString(`{"name":"Updated Hostel","check_in":"2026-08-03","check_out":"2026-08-06"}`),
	)
	if err != nil {
		t.Fatalf("build patch: %v", err)
	}
	patchReq.Header.Set("Content-Type", "application/json")
	patchResp, err := http.DefaultClient.Do(patchReq)
	if err != nil {
		t.Fatalf("patch stay: %v", err)
	}
	defer patchResp.Body.Close()
	if patchResp.StatusCode != http.StatusOK {
		t.Fatalf("patch stay status = %d, want 200", patchResp.StatusCode)
	}
	var updated stayResponse
	if err := json.NewDecoder(patchResp.Body).Decode(&updated); err != nil {
		t.Fatalf("decode updated stay: %v", err)
	}
	if updated.Name != "Updated Hostel" {
		t.Errorf("updated name = %q, want Updated Hostel", updated.Name)
	}
	if updated.CheckIn != "2026-08-03" {
		t.Errorf("updated check_in = %q, want 2026-08-03", updated.CheckIn)
	}

	// ── Delete ─────────────────────────────────────────────────────────────
	delReq, err := http.NewRequest(http.MethodDelete,
		fmt.Sprintf("%s%s/%s/stays/%s", srv.URL, TripsPath, tripID, stayID),
		http.NoBody,
	)
	if err != nil {
		t.Fatalf("build delete: %v", err)
	}
	delResp, err := http.DefaultClient.Do(delReq)
	if err != nil {
		t.Fatalf("delete stay: %v", err)
	}
	defer delResp.Body.Close()
	if delResp.StatusCode != http.StatusNoContent {
		t.Fatalf("delete stay status = %d, want 204", delResp.StatusCode)
	}

	// Replaying the same delete is idempotent (204, not 404).
	delResp2, err := http.DefaultClient.Do(delReq)
	if err != nil {
		t.Fatalf("replay delete stay: %v", err)
	}
	defer delResp2.Body.Close()
	if delResp2.StatusCode != http.StatusNoContent {
		t.Fatalf("replay delete stay status = %d, want 204 (idempotent)", delResp2.StatusCode)
	}
}

// TestStayCRUDUpsertIdempotency verifies that replaying a create with the same
// client-supplied id updates the stay rather than inserting a duplicate.
func TestStayCRUDUpsertIdempotency(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping stay integration test")
	}

	srv := newModule(t)
	tripID := createTripForStayTest(t, srv)
	clientID := "00000000-0000-0000-0000-000000000001"

	doCreate := func(name string) stayResponse {
		t.Helper()
		body := fmt.Sprintf(`{"id":%q,"name":%q}`, clientID, name)
		resp, err := http.Post(
			fmt.Sprintf("%s%s/%s/stays", srv.URL, TripsPath, tripID),
			"application/json",
			bytes.NewBufferString(body),
		)
		if err != nil {
			t.Fatalf("create stay: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("create stay status = %d, want 201", resp.StatusCode)
		}
		var st stayResponse
		if err := json.NewDecoder(resp.Body).Decode(&st); err != nil {
			t.Fatalf("decode stay: %v", err)
		}
		return st
	}

	st1 := doCreate("First Name")
	if st1.ID != clientID {
		t.Errorf("id = %q, want %q (client-supplied)", st1.ID, clientID)
	}

	// Replay with updated name — should upsert, not create a second row.
	st2 := doCreate("Replayed Name")
	if st2.ID != clientID {
		t.Errorf("replayed id = %q, want %q", st2.ID, clientID)
	}
	if st2.Name != "Replayed Name" {
		t.Errorf("replayed name = %q, want Replayed Name", st2.Name)
	}
}

// TestStayCRUDAuthorizationDenied verifies that a second user cannot create,
// update, or delete a stay on another user's trip (returns 404 — presence
// oracle protection).
func TestStayCRUDAuthorizationDenied(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping stay integration test")
	}

	ownerID := freshOwnerID(t)
	otherID := freshOwnerID(t)

	// Server authenticated as the owner creates the trip.
	ownerSrv := newModuleWithOwner(t, ownerID)
	tripID := createTripForStayTest(t, ownerSrv)

	// Create a stay as owner.
	resp, err := http.Post(
		fmt.Sprintf("%s%s/%s/stays", ownerSrv.URL, TripsPath, tripID),
		"application/json",
		bytes.NewBufferString(`{"name":"Owner's Stay"}`),
	)
	if err != nil {
		t.Fatalf("owner create stay: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("owner create stay status = %d, want 201", resp.StatusCode)
	}
	var st stayResponse
	if err := json.NewDecoder(resp.Body).Decode(&st); err != nil {
		t.Fatalf("decode stay: %v", err)
	}
	stayID := st.ID

	// Server authenticated as the other user attempts operations — all 404.
	otherSrv := newModuleWithOwner(t, otherID)

	resp2, err := http.Post(
		fmt.Sprintf("%s%s/%s/stays", otherSrv.URL, TripsPath, tripID),
		"application/json",
		bytes.NewBufferString(`{"name":"Attacker"}`),
	)
	if err != nil {
		t.Fatalf("other create stay: %v", err)
	}
	defer resp2.Body.Close()
	if resp2.StatusCode != http.StatusNotFound {
		t.Errorf("other create stay status = %d, want 404", resp2.StatusCode)
	}

	patchReq, _ := http.NewRequest(http.MethodPatch,
		fmt.Sprintf("%s%s/%s/stays/%s", otherSrv.URL, TripsPath, tripID, stayID),
		bytes.NewBufferString(`{"name":"Hacked"}`),
	)
	patchReq.Header.Set("Content-Type", "application/json")
	resp3, err := http.DefaultClient.Do(patchReq)
	if err != nil {
		t.Fatalf("other patch stay: %v", err)
	}
	defer resp3.Body.Close()
	if resp3.StatusCode != http.StatusNotFound {
		t.Errorf("other patch stay status = %d, want 404", resp3.StatusCode)
	}

	delReq, _ := http.NewRequest(http.MethodDelete,
		fmt.Sprintf("%s%s/%s/stays/%s", otherSrv.URL, TripsPath, tripID, stayID),
		http.NoBody,
	)
	resp4, err := http.DefaultClient.Do(delReq)
	if err != nil {
		t.Fatalf("other delete stay: %v", err)
	}
	defer resp4.Body.Close()
	if resp4.StatusCode != http.StatusNotFound {
		t.Errorf("other delete stay status = %d, want 404", resp4.StatusCode)
	}
}

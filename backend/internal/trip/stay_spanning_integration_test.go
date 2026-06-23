//go:build integration

// Integration tests for multi-night stay spanning (M04.1 S3). They drive the
// full handler → pgxStayStore.StaysForDay → DB path and verify that a stay
// entered once appears in GET /trips/{id}/days/{date} for every night in its
// [check_in, check_out) half-open range.
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

// getDay fetches GET /trips/{tripID}/days/{date} and decodes the response body.
func getDay(t *testing.T, srv *httptest.Server, tripID, date string) dayResponse {
	t.Helper()
	resp, err := http.Get(fmt.Sprintf("%s%s/%s/days/%s", srv.URL, TripsPath, tripID, date))
	if err != nil {
		t.Fatalf("GET day %s: %v", date, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET day %s status = %d, want 200", date, resp.StatusCode)
	}
	var dr dayResponse
	if err := json.NewDecoder(resp.Body).Decode(&dr); err != nil {
		t.Fatalf("decode day %s: %v", date, err)
	}
	return dr
}

// createStay POSTs a new stay and returns the decoded response.
func createStay(t *testing.T, srv *httptest.Server, tripID, body string) stayResponse {
	t.Helper()
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

// editStay PATCHes an existing stay and returns the decoded response.
func editStay(t *testing.T, srv *httptest.Server, tripID, stayID, body string) stayResponse {
	t.Helper()
	req, err := http.NewRequest(http.MethodPatch,
		fmt.Sprintf("%s%s/%s/stays/%s", srv.URL, TripsPath, tripID, stayID),
		bytes.NewBufferString(body),
	)
	if err != nil {
		t.Fatalf("build patch: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("patch stay: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("patch stay status = %d, want 200", resp.StatusCode)
	}
	var st stayResponse
	if err := json.NewDecoder(resp.Body).Decode(&st); err != nil {
		t.Fatalf("decode patched stay: %v", err)
	}
	return st
}

// stayIDsIn returns the ids of all stays in dr.
func stayIDsIn(dr dayResponse) []string {
	ids := make([]string, len(dr.Stays))
	for i, s := range dr.Stays {
		ids[i] = s.ID
	}
	return ids
}

// containsID reports whether id appears in ids.
func containsID(ids []string, id string) bool {
	for _, x := range ids {
		if x == id {
			return true
		}
	}
	return false
}

// TestStaySpanningMultiNight verifies that a multi-night stay entered once
// appears in GET /days/{date} for each covered night (check_in <= date <
// check_out) and absent on the check_out day and outside dates.
func TestStaySpanningMultiNight(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping stay spanning integration test")
	}

	srv := newModule(t)

	// Trip spans 2026-09-01 to 2026-09-10.
	tripBody := `{"name":"Span Trip","start_date":"2026-09-01","end_date":"2026-09-10"}`
	resp, err := http.Post(srv.URL+TripsPath, "application/json", bytes.NewBufferString(tripBody))
	if err != nil {
		t.Fatalf("create trip: %v", err)
	}
	defer resp.Body.Close()
	var tr tripResponse
	if err := json.NewDecoder(resp.Body).Decode(&tr); err != nil {
		t.Fatalf("decode trip: %v", err)
	}
	tripID := tr.ID

	// Multi-night stay: covers Sep 03, 04, 05 (check_out Sep 06 is exclusive).
	st := createStay(t, srv, tripID,
		`{"name":"Grand Hotel","check_in":"2026-09-03","check_out":"2026-09-06"}`)

	covered := []string{"2026-09-03", "2026-09-04", "2026-09-05"}
	for _, date := range covered {
		dr := getDay(t, srv, tripID, date)
		ids := stayIDsIn(dr)
		if !containsID(ids, st.ID) {
			t.Errorf("date %s: stay %s missing from %v", date, st.ID, ids)
		}
	}

	// check_out day and surrounding days must NOT include the stay.
	excluded := []string{"2026-09-01", "2026-09-02", "2026-09-06", "2026-09-07"}
	for _, date := range excluded {
		dr := getDay(t, srv, tripID, date)
		ids := stayIDsIn(dr)
		if containsID(ids, st.ID) {
			t.Errorf("date %s: stay %s should not appear on this date", date, st.ID)
		}
	}
}

// TestStaySpanningSingleNight verifies that a single-night stay appears only
// on the check_in date and not on the check_out date.
func TestStaySpanningSingleNight(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping stay spanning integration test")
	}

	srv := newModule(t)

	tripBody := `{"name":"Single Night Trip","start_date":"2026-09-01","end_date":"2026-09-05"}`
	resp, err := http.Post(srv.URL+TripsPath, "application/json", bytes.NewBufferString(tripBody))
	if err != nil {
		t.Fatalf("create trip: %v", err)
	}
	defer resp.Body.Close()
	var tr tripResponse
	if err := json.NewDecoder(resp.Body).Decode(&tr); err != nil {
		t.Fatalf("decode trip: %v", err)
	}
	tripID := tr.ID

	// Single-night stay: check_in = Sep 03, check_out = Sep 04.
	st := createStay(t, srv, tripID,
		`{"name":"One Night Stay","check_in":"2026-09-03","check_out":"2026-09-04"}`)

	dr := getDay(t, srv, tripID, "2026-09-03")
	if !containsID(stayIDsIn(dr), st.ID) {
		t.Errorf("Sep 03: single-night stay missing")
	}

	dr = getDay(t, srv, tripID, "2026-09-04")
	if containsID(stayIDsIn(dr), st.ID) {
		t.Errorf("Sep 04 (check_out): stay should not appear (half-open interval)")
	}
}

// TestStaySpanningDateEditChangesCoverage verifies that editing a stay's dates
// updates which days it appears on without duplicating data.
func TestStaySpanningDateEditChangesCoverage(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping stay spanning integration test")
	}

	srv := newModule(t)

	tripBody := `{"name":"Edit Coverage Trip","start_date":"2026-09-01","end_date":"2026-09-15"}`
	resp, err := http.Post(srv.URL+TripsPath, "application/json", bytes.NewBufferString(tripBody))
	if err != nil {
		t.Fatalf("create trip: %v", err)
	}
	defer resp.Body.Close()
	var tr tripResponse
	if err := json.NewDecoder(resp.Body).Decode(&tr); err != nil {
		t.Fatalf("decode trip: %v", err)
	}
	tripID := tr.ID

	// Initial stay: covers Sep 01-02.
	st := createStay(t, srv, tripID,
		`{"name":"Moving Hotel","check_in":"2026-09-01","check_out":"2026-09-03"}`)

	// Confirm initial coverage.
	if !containsID(stayIDsIn(getDay(t, srv, tripID, "2026-09-01")), st.ID) {
		t.Error("before edit: Sep 01 should contain stay")
	}
	if containsID(stayIDsIn(getDay(t, srv, tripID, "2026-09-10")), st.ID) {
		t.Error("before edit: Sep 10 should not contain stay")
	}

	// Edit dates to cover Sep 10-12.
	editStay(t, srv, tripID, st.ID,
		`{"name":"Moving Hotel","check_in":"2026-09-10","check_out":"2026-09-13"}`)

	// Sep 01-02 must no longer include the stay.
	if containsID(stayIDsIn(getDay(t, srv, tripID, "2026-09-01")), st.ID) {
		t.Error("after edit: Sep 01 should no longer contain stay")
	}

	// Sep 10-12 must now include the stay.
	for _, date := range []string{"2026-09-10", "2026-09-11", "2026-09-12"} {
		if !containsID(stayIDsIn(getDay(t, srv, tripID, date)), st.ID) {
			t.Errorf("after edit: %s should contain stay", date)
		}
	}

	// Sep 13 (check_out) must not include the stay.
	if containsID(stayIDsIn(getDay(t, srv, tripID, "2026-09-13")), st.ID) {
		t.Error("after edit: Sep 13 (check_out) should not contain stay (half-open)")
	}
}

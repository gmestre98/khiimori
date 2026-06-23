//go:build integration

// Integration tests for PlanItem edit & delete (M04.2 S3). They drive the
// full handler → pgxPlanItemStore → DB path through the HTTP server, covering
// edit (partial fields, timed↔untimed toggling) and delete (idempotent).
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

// createTripForPlanItemTest creates a trip owned by the server's principal.
func createTripForPlanItemTest(t *testing.T, srv *httptest.Server) string {
	t.Helper()
	body := `{"name":"Plan Item Test Trip","start_date":"2026-09-01","end_date":"2026-09-07"}`
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

// createPlanItem creates a plan item and returns the response.
func createPlanItem(t *testing.T, srv *httptest.Server, tripID, body string) planItemResponse {
	t.Helper()
	resp, err := http.Post(
		fmt.Sprintf("%s%s/%s/plan-items", srv.URL, TripsPath, tripID),
		"application/json",
		bytes.NewBufferString(body),
	)
	if err != nil {
		t.Fatalf("create plan item: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create plan item status = %d, want 201", resp.StatusCode)
	}
	var pi planItemResponse
	if err := json.NewDecoder(resp.Body).Decode(&pi); err != nil {
		t.Fatalf("decode plan item: %v", err)
	}
	return pi
}

// TestPlanItemEditDeleteIntegration exercises edit and delete through the HTTP
// server → pgxPlanItemStore → real DB.
func TestPlanItemEditDeleteIntegration(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping plan item integration test")
	}

	srv := newModule(t)
	tripID := createTripForPlanItemTest(t, srv)

	// ── Create (title-only, untimed) ──────────────────────────────────────────
	pi := createPlanItem(t, srv, tripID, `{"title":"Visit the castle"}`)
	if pi.ID == "" {
		t.Fatal("created plan item has no id")
	}
	if pi.Title != "Visit the castle" {
		t.Errorf("title = %q, want Visit the castle", pi.Title)
	}
	if pi.StartTime != nil {
		t.Errorf("start_time = %v, want nil (untimed)", pi.StartTime)
	}
	itemID := pi.ID

	// ── Edit: partial field update ────────────────────────────────────────────
	patchBody := `{"title":"Explore the castle","location":"Sintra","type":"sightseeing"}`
	patchReq, _ := http.NewRequest(http.MethodPatch,
		fmt.Sprintf("%s%s/%s/plan-items/%s", srv.URL, TripsPath, tripID, itemID),
		bytes.NewBufferString(patchBody),
	)
	patchReq.Header.Set("Content-Type", "application/json")
	patchResp, err := http.DefaultClient.Do(patchReq)
	if err != nil {
		t.Fatalf("patch plan item: %v", err)
	}
	defer patchResp.Body.Close()
	if patchResp.StatusCode != http.StatusOK {
		t.Fatalf("patch plan item status = %d, want 200", patchResp.StatusCode)
	}
	var updated planItemResponse
	if err := json.NewDecoder(patchResp.Body).Decode(&updated); err != nil {
		t.Fatalf("decode updated plan item: %v", err)
	}
	if updated.Title != "Explore the castle" {
		t.Errorf("updated title = %q, want Explore the castle", updated.Title)
	}
	if updated.Location == nil || *updated.Location != "Sintra" {
		t.Errorf("updated location = %v, want Sintra", updated.Location)
	}
	if updated.Type == nil || *updated.Type != "sightseeing" {
		t.Errorf("updated type = %v, want sightseeing", updated.Type)
	}
	if updated.StartTime != nil {
		t.Errorf("start_time = %v, want nil (still untimed)", updated.StartTime)
	}

	// ── Edit: untimed → timed ─────────────────────────────────────────────────
	timedBody := `{"title":"Explore the castle","start_time":"10:00","duration":"PT2H"}`
	patchReq2, _ := http.NewRequest(http.MethodPatch,
		fmt.Sprintf("%s%s/%s/plan-items/%s", srv.URL, TripsPath, tripID, itemID),
		bytes.NewBufferString(timedBody),
	)
	patchReq2.Header.Set("Content-Type", "application/json")
	patchResp2, err := http.DefaultClient.Do(patchReq2)
	if err != nil {
		t.Fatalf("patch plan item (timed): %v", err)
	}
	defer patchResp2.Body.Close()
	if patchResp2.StatusCode != http.StatusOK {
		t.Fatalf("patch plan item (timed) status = %d, want 200", patchResp2.StatusCode)
	}
	var timed planItemResponse
	if err := json.NewDecoder(patchResp2.Body).Decode(&timed); err != nil {
		t.Fatalf("decode timed plan item: %v", err)
	}
	if timed.StartTime == nil || *timed.StartTime != "10:00:00" {
		t.Errorf("start_time = %v, want 10:00:00 (timed)", timed.StartTime)
	}

	// ── Edit: timed → untimed (clear start_time) ──────────────────────────────
	untimedBody := `{"title":"Explore the castle"}`
	patchReq3, _ := http.NewRequest(http.MethodPatch,
		fmt.Sprintf("%s%s/%s/plan-items/%s", srv.URL, TripsPath, tripID, itemID),
		bytes.NewBufferString(untimedBody),
	)
	patchReq3.Header.Set("Content-Type", "application/json")
	patchResp3, err := http.DefaultClient.Do(patchReq3)
	if err != nil {
		t.Fatalf("patch plan item (untimed): %v", err)
	}
	defer patchResp3.Body.Close()
	if patchResp3.StatusCode != http.StatusOK {
		t.Fatalf("patch plan item (untimed) status = %d, want 200", patchResp3.StatusCode)
	}
	var untimed planItemResponse
	if err := json.NewDecoder(patchResp3.Body).Decode(&untimed); err != nil {
		t.Fatalf("decode untimed plan item: %v", err)
	}
	if untimed.StartTime != nil {
		t.Errorf("start_time = %v, want nil after clearing (untimed)", untimed.StartTime)
	}
	if untimed.Duration != nil {
		t.Errorf("duration = %v, want nil after clearing start_time", untimed.Duration)
	}

	// ── Delete ────────────────────────────────────────────────────────────────
	delReq, _ := http.NewRequest(http.MethodDelete,
		fmt.Sprintf("%s%s/%s/plan-items/%s", srv.URL, TripsPath, tripID, itemID),
		http.NoBody,
	)
	delResp, err := http.DefaultClient.Do(delReq)
	if err != nil {
		t.Fatalf("delete plan item: %v", err)
	}
	defer delResp.Body.Close()
	if delResp.StatusCode != http.StatusNoContent {
		t.Fatalf("delete plan item status = %d, want 204", delResp.StatusCode)
	}

	// ── Delete replay (idempotent) ────────────────────────────────────────────
	delResp2, err := http.DefaultClient.Do(delReq)
	if err != nil {
		t.Fatalf("replay delete plan item: %v", err)
	}
	defer delResp2.Body.Close()
	if delResp2.StatusCode != http.StatusNoContent {
		t.Fatalf("replay delete plan item status = %d, want 204 (idempotent)", delResp2.StatusCode)
	}
}

// TestPlanItemEditDeleteAuthorizationDenied verifies that a second user cannot
// edit or delete another user's plan item (returns 404 — presence oracle).
func TestPlanItemEditDeleteAuthorizationDenied(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping plan item integration test")
	}

	ownerID := freshOwnerID(t)
	otherID := freshOwnerID(t)

	ownerSrv := newModuleWithOwner(t, ownerID)
	tripID := createTripForPlanItemTest(t, ownerSrv)
	pi := createPlanItem(t, ownerSrv, tripID, `{"title":"Owner's item"}`)
	itemID := pi.ID

	otherSrv := newModuleWithOwner(t, otherID)

	patchReq, _ := http.NewRequest(http.MethodPatch,
		fmt.Sprintf("%s%s/%s/plan-items/%s", otherSrv.URL, TripsPath, tripID, itemID),
		bytes.NewBufferString(`{"title":"Hacked"}`),
	)
	patchReq.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(patchReq)
	if err != nil {
		t.Fatalf("other patch plan item: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("other patch plan item status = %d, want 404", resp.StatusCode)
	}

	delReq, _ := http.NewRequest(http.MethodDelete,
		fmt.Sprintf("%s%s/%s/plan-items/%s", otherSrv.URL, TripsPath, tripID, itemID),
		http.NoBody,
	)
	resp2, err := http.DefaultClient.Do(delReq)
	if err != nil {
		t.Fatalf("other delete plan item: %v", err)
	}
	defer resp2.Body.Close()
	if resp2.StatusCode != http.StatusNotFound {
		t.Errorf("other delete plan item status = %d, want 404", resp2.StatusCode)
	}
}

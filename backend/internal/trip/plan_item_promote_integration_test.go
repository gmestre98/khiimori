//go:build integration

// Integration tests for promote & demote (M04.3 S2). They drive the full
// handler → pgxPlanItemStore → DB path, covering the promote round-trip,
// field preservation, and authorization.
//
// Run with:
//
//	DATABASE_URL_TEST=<direct DSN> go test -tags=integration ./internal/trip/...
package trip

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

// promotePlanItem calls POST …/promote and decodes the response.
func promotePlanItem(t *testing.T, srv *httptest.Server, tripID, itemID, body string) planItemResponse {
	t.Helper()
	path := fmt.Sprintf("%s/%s/plan-items/%s/promote", TripsPath, tripID, itemID)
	resp := postJSON(t, srv, path, json.RawMessage(body))
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("promote plan item status = %d, want 200", resp.StatusCode)
	}
	var pi planItemResponse
	if err := json.NewDecoder(resp.Body).Decode(&pi); err != nil {
		t.Fatalf("decode promote response: %v", err)
	}
	return pi
}

// demotePlanItem calls POST …/demote and decodes the response.
func demotePlanItem(t *testing.T, srv *httptest.Server, tripID, itemID string) planItemResponse {
	t.Helper()
	path := fmt.Sprintf("%s/%s/plan-items/%s/demote", TripsPath, tripID, itemID)
	resp := postJSON(t, srv, path, json.RawMessage(`{}`))
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("demote plan item status = %d, want 200", resp.StatusCode)
	}
	var pi planItemResponse
	if err := json.NewDecoder(resp.Body).Decode(&pi); err != nil {
		t.Fatalf("decode demote response: %v", err)
	}
	return pi
}

// getDayID fetches the day record for a date and returns its ID.
func getDayID(t *testing.T, srv *httptest.Server, tripID, date string) string {
	t.Helper()
	resp, err := http.Get(fmt.Sprintf("%s%s/%s/days/%s", srv.URL, TripsPath, tripID, date))
	if err != nil {
		t.Fatalf("get day: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("get day status = %d, want 200", resp.StatusCode)
	}
	var d dayResponse
	if err := json.NewDecoder(resp.Body).Decode(&d); err != nil {
		t.Fatalf("decode day: %v", err)
	}
	return d.ID
}

// TestPromoteDemoteRoundTripIntegration exercises the full promote → demote
// round-trip: creates a backlog item, promotes it to a day, verifies it lands
// on the day, then demotes it back and verifies it's in the backlog again.
func TestPromoteDemoteRoundTripIntegration(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping promote/demote integration test")
	}

	srv := newModule(t)
	tripID := createTripForPlanItemTest(t, srv)
	dayID := getDayID(t, srv, tripID, "2026-09-01")

	// Create a backlog item (no day_id).
	pi := createPlanItem(t, srv, tripID, `{"title":"Visit the palace","type":"sightseeing"}`)
	if pi.DayID != nil {
		t.Fatalf("new item day_id = %v, want nil (backlog)", pi.DayID)
	}
	if pi.Status != "idea" {
		t.Fatalf("new item status = %q, want idea", pi.Status)
	}
	itemID := pi.ID

	// ── Promote to day ────────────────────────────────────────────────────────
	promoted := promotePlanItem(t, srv, tripID, itemID,
		fmt.Sprintf(`{"day_id":%q,"start_time":"14:00"}`, dayID))

	if promoted.ID != itemID {
		t.Errorf("promoted id = %q, want %q (same row)", promoted.ID, itemID)
	}
	if promoted.DayID == nil || *promoted.DayID != dayID {
		t.Errorf("promoted day_id = %v, want %q", promoted.DayID, dayID)
	}
	if promoted.Status != "planned" {
		t.Errorf("promoted status = %q, want planned", promoted.Status)
	}
	if promoted.StartTime == nil || *promoted.StartTime != "14:00:00" {
		t.Errorf("promoted start_time = %v, want 14:00:00", promoted.StartTime)
	}
	// Non-day_id fields must be preserved.
	if promoted.Title != "Visit the palace" {
		t.Errorf("promoted title = %q, want Visit the palace (field preserved)", promoted.Title)
	}
	if promoted.Type == nil || *promoted.Type != "sightseeing" {
		t.Errorf("promoted type = %v, want sightseeing (field preserved)", promoted.Type)
	}

	// ── Demote back to backlog ─────────────────────────────────────────────────
	demoted := demotePlanItem(t, srv, tripID, itemID)

	if demoted.ID != itemID {
		t.Errorf("demoted id = %q, want %q (same row)", demoted.ID, itemID)
	}
	if demoted.DayID != nil {
		t.Errorf("demoted day_id = %v, want nil (backlog)", demoted.DayID)
	}
	if demoted.StartTime != nil {
		t.Errorf("demoted start_time = %v, want nil (cleared on demote)", demoted.StartTime)
	}
	if demoted.Status != "idea" {
		t.Errorf("demoted status = %q, want idea", demoted.Status)
	}
	// Non-scheduling fields preserved through demote.
	if demoted.Title != "Visit the palace" {
		t.Errorf("demoted title = %q, want Visit the palace (field preserved)", demoted.Title)
	}
	if demoted.Type == nil || *demoted.Type != "sightseeing" {
		t.Errorf("demoted type = %v, want sightseeing (field preserved)", demoted.Type)
	}
}

// TestPromoteSortOrderIntegration verifies that two promoted items get
// sequential sort_order values (each appended at the end of the day).
func TestPromoteSortOrderIntegration(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping promote sort_order integration test")
	}

	srv := newModule(t)
	tripID := createTripForPlanItemTest(t, srv)
	dayID := getDayID(t, srv, tripID, "2026-09-02")

	pi1 := createPlanItem(t, srv, tripID, `{"title":"First idea"}`)
	pi2 := createPlanItem(t, srv, tripID, `{"title":"Second idea"}`)

	p1 := promotePlanItem(t, srv, tripID, pi1.ID, fmt.Sprintf(`{"day_id":%q}`, dayID))
	p2 := promotePlanItem(t, srv, tripID, pi2.ID, fmt.Sprintf(`{"day_id":%q}`, dayID))

	if p2.SortOrder <= p1.SortOrder {
		t.Errorf("second promoted item sort_order = %d, want > %d (appended after first)",
			p2.SortOrder, p1.SortOrder)
	}
}

// TestPromoteDemoteAuthorizationDeniedIntegration verifies that a second user
// cannot promote or demote another user's plan item (404 — presence oracle).
func TestPromoteDemoteAuthorizationDeniedIntegration(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping promote/demote authz integration test")
	}

	ownerID := freshOwnerID(t)
	otherID := freshOwnerID(t)

	ownerSrv := newModuleWithOwner(t, ownerID)
	tripID := createTripForPlanItemTest(t, ownerSrv)
	dayID := getDayID(t, ownerSrv, tripID, "2026-09-01")
	pi := createPlanItem(t, ownerSrv, tripID, `{"title":"Owner's idea"}`)
	itemID := pi.ID

	otherSrv := newModuleWithOwner(t, otherID)

	promotePath := fmt.Sprintf("%s/%s/plan-items/%s/promote", TripsPath, tripID, itemID)
	resp := postJSON(t, otherSrv, promotePath, json.RawMessage(fmt.Sprintf(`{"day_id":%q}`, dayID)))
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("other promote status = %d, want 404 (presence oracle)", resp.StatusCode)
	}

	demotePath := fmt.Sprintf("%s/%s/plan-items/%s/demote", TripsPath, tripID, itemID)
	resp2 := postJSON(t, otherSrv, demotePath, json.RawMessage(`{}`))
	defer resp2.Body.Close()
	if resp2.StatusCode != http.StatusNotFound {
		t.Errorf("other demote status = %d, want 404 (presence oracle)", resp2.StatusCode)
	}
}

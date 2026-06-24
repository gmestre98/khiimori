//go:build integration

// Integration tests for status transitions (M04.4 S3). They drive the full
// handler → pgxPlanItemStore → DB path, covering setting each lifecycle status,
// preservation of the item's other fields, idempotent replay, rejection of an
// out-of-set value (validation + DB CHECK backstop), and authorization.
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

// setPlanItemStatus calls POST …/status and decodes the 200 response.
func setPlanItemStatus(t *testing.T, srv *httptest.Server, tripID, itemID, status string) planItemResponse {
	t.Helper()
	path := fmt.Sprintf("%s/%s/plan-items/%s/status", TripsPath, tripID, itemID)
	resp := postJSON(t, srv, path, json.RawMessage(fmt.Sprintf(`{"status":%q}`, status)))
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("set status %q: status = %d, want 200", status, resp.StatusCode)
	}
	var pi planItemResponse
	if err := json.NewDecoder(resp.Body).Decode(&pi); err != nil {
		t.Fatalf("decode set-status response: %v", err)
	}
	return pi
}

// TestSetPlanItemStatusTransitionsIntegration verifies that an item can be moved
// to every lifecycle status (in any order — no rigid state machine) and that its
// other fields (day_id, start_time, title, type) are preserved across the change.
func TestSetPlanItemStatusTransitionsIntegration(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping status integration test")
	}

	srv := newModule(t)
	tripID := createTripForPlanItemTest(t, srv)
	dayID := getDayID(t, srv, tripID, "2026-09-01")

	// Create a timed item on a day — default status is "planned".
	body := fmt.Sprintf(`{"title":"Museum","type":"sightseeing","start_time":"10:00","day_id":%q}`, dayID)
	pi := createPlanItem(t, srv, tripID, body)
	if pi.Status != "planned" {
		t.Fatalf("new item status = %q, want planned", pi.Status)
	}
	itemID := pi.ID

	// Walk through the non-default statuses, ending back at "planned" to prove
	// transitions are unrestricted in both directions (PRD §7.0).
	for _, status := range []string{"done", "skipped", "cancelled", "idea", "planned"} {
		got := setPlanItemStatus(t, srv, tripID, itemID, status)

		if got.ID != itemID {
			t.Errorf("status=%q: id = %q, want %q (same row)", status, got.ID, itemID)
		}
		if got.Status != status {
			t.Errorf("status=%q: response status = %q", status, got.Status)
		}
		// Other fields must be untouched by a status change.
		if got.DayID == nil || *got.DayID != dayID {
			t.Errorf("status=%q: day_id = %v, want %q (preserved)", status, got.DayID, dayID)
		}
		if got.StartTime == nil || *got.StartTime != "10:00:00" {
			t.Errorf("status=%q: start_time = %v, want 10:00:00 (preserved)", status, got.StartTime)
		}
		if got.Title != "Museum" {
			t.Errorf("status=%q: title = %q, want Museum (preserved)", status, got.Title)
		}
		if got.Type == nil || *got.Type != "sightseeing" {
			t.Errorf("status=%q: type = %v, want sightseeing (preserved)", status, got.Type)
		}
	}
}

// TestSetPlanItemStatusIdempotentIntegration verifies that replaying the same
// status converges (idempotent for Epic 06 offline replay).
func TestSetPlanItemStatusIdempotentIntegration(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping status idempotency integration test")
	}

	srv := newModule(t)
	tripID := createTripForPlanItemTest(t, srv)
	dayID := getDayID(t, srv, tripID, "2026-09-02")

	pi := createPlanItem(t, srv, tripID, fmt.Sprintf(`{"title":"Lunch","day_id":%q}`, dayID))

	first := setPlanItemStatus(t, srv, tripID, pi.ID, "done")
	second := setPlanItemStatus(t, srv, tripID, pi.ID, "done")

	if first.Status != "done" || second.Status != "done" {
		t.Errorf("idempotent status: first=%q second=%q, want both done", first.Status, second.Status)
	}
}

// TestSetPlanItemStatusRejectsInvalidIntegration verifies that an out-of-set
// status is rejected with 400 (handler validation; the DB CHECK is a backstop).
func TestSetPlanItemStatusRejectsInvalidIntegration(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping status validation integration test")
	}

	srv := newModule(t)
	tripID := createTripForPlanItemTest(t, srv)
	dayID := getDayID(t, srv, tripID, "2026-09-03")
	pi := createPlanItem(t, srv, tripID, fmt.Sprintf(`{"title":"Walk","day_id":%q}`, dayID))

	path := fmt.Sprintf("%s/%s/plan-items/%s/status", TripsPath, tripID, pi.ID)
	resp := postJSON(t, srv, path, json.RawMessage(`{"status":"archived"}`))
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("invalid status: status = %d, want 400", resp.StatusCode)
	}
}

// TestSetPlanItemStatusAuthorizationDeniedIntegration verifies that a second
// user cannot change another user's item status (404 — presence oracle).
func TestSetPlanItemStatusAuthorizationDeniedIntegration(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping status authz integration test")
	}

	ownerID := freshOwnerID(t)
	otherID := freshOwnerID(t)

	ownerSrv := newModuleWithOwner(t, ownerID)
	tripID := createTripForPlanItemTest(t, ownerSrv)
	dayID := getDayID(t, ownerSrv, tripID, "2026-09-01")
	pi := createPlanItem(t, ownerSrv, tripID, fmt.Sprintf(`{"title":"Owner's item","day_id":%q}`, dayID))

	otherSrv := newModuleWithOwner(t, otherID)
	path := fmt.Sprintf("%s/%s/plan-items/%s/status", TripsPath, tripID, pi.ID)
	resp := postJSON(t, otherSrv, path, json.RawMessage(`{"status":"done"}`))
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("other set-status status = %d, want 404 (presence oracle)", resp.StatusCode)
	}
}

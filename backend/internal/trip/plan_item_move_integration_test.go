//go:build integration

// Integration tests for move-between-days (M04.4 S2). They drive the full
// handler → pgxPlanItemStore → DB path, covering the move round-trip,
// field and start_time preservation, sort_order placement, and authorization.
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

// movePlanItem calls POST …/move and decodes the response.
func movePlanItem(t *testing.T, srv *httptest.Server, tripID, itemID, body string) planItemResponse {
	t.Helper()
	path := fmt.Sprintf("%s/%s/plan-items/%s/move", TripsPath, tripID, itemID)
	resp := postJSON(t, srv, path, json.RawMessage(body))
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("move plan item status = %d, want 200", resp.StatusCode)
	}
	var pi planItemResponse
	if err := json.NewDecoder(resp.Body).Decode(&pi); err != nil {
		t.Fatalf("decode move response: %v", err)
	}
	return pi
}

// TestMovePlanItemBetweenDaysIntegration verifies the core move round-trip:
// creates an item on day1, moves it to day2, checks day_id changed, other
// fields are preserved, and the item is appended at the end of day2.
func TestMovePlanItemBetweenDaysIntegration(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping move integration test")
	}

	srv := newModule(t)
	tripID := createTripForPlanItemTest(t, srv)
	day1ID := getDayID(t, srv, tripID, "2026-09-01")
	day2ID := getDayID(t, srv, tripID, "2026-09-02")

	// Create a timed item directly on day1.
	body := fmt.Sprintf(`{"title":"Hike","type":"outdoor","start_time":"09:00","day_id":%q}`, day1ID)
	pi := createPlanItem(t, srv, tripID, body)
	if pi.DayID == nil || *pi.DayID != day1ID {
		t.Fatalf("item day_id = %v, want %q", pi.DayID, day1ID)
	}
	itemID := pi.ID

	// Move to day2 (no new start_time — keep existing).
	moved := movePlanItem(t, srv, tripID, itemID,
		fmt.Sprintf(`{"day_id":%q}`, day2ID))

	if moved.ID != itemID {
		t.Errorf("moved id = %q, want %q (same row)", moved.ID, itemID)
	}
	if moved.DayID == nil || *moved.DayID != day2ID {
		t.Errorf("moved day_id = %v, want %q", moved.DayID, day2ID)
	}
	// start_time preserved when not supplied in move request.
	if moved.StartTime == nil || *moved.StartTime != "09:00:00" {
		t.Errorf("moved start_time = %v, want 09:00:00 (preserved)", moved.StartTime)
	}
	// Non-scheduling fields preserved.
	if moved.Title != "Hike" {
		t.Errorf("moved title = %q, want Hike (field preserved)", moved.Title)
	}
	if moved.Type == nil || *moved.Type != "outdoor" {
		t.Errorf("moved type = %v, want outdoor (field preserved)", moved.Type)
	}
	// Status is unchanged (still "planned").
	if moved.Status != "planned" {
		t.Errorf("moved status = %q, want planned", moved.Status)
	}
}

// TestMovePlanItemSortOrderIntegration verifies that a moved item is appended
// after existing items on the target day.
func TestMovePlanItemSortOrderIntegration(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping move sort_order integration test")
	}

	srv := newModule(t)
	tripID := createTripForPlanItemTest(t, srv)
	day1ID := getDayID(t, srv, tripID, "2026-09-03")
	day2ID := getDayID(t, srv, tripID, "2026-09-04")

	// Two items already on day2.
	existing1 := createPlanItem(t, srv, tripID, fmt.Sprintf(`{"title":"Existing 1","day_id":%q}`, day2ID))
	existing2 := createPlanItem(t, srv, tripID, fmt.Sprintf(`{"title":"Existing 2","day_id":%q}`, day2ID))

	// Item on day1 to be moved.
	mover := createPlanItem(t, srv, tripID, fmt.Sprintf(`{"title":"Mover","day_id":%q}`, day1ID))

	moved := movePlanItem(t, srv, tripID, mover.ID, fmt.Sprintf(`{"day_id":%q}`, day2ID))

	// Moved item must land after both existing items.
	if moved.SortOrder <= existing1.SortOrder {
		t.Errorf("moved sort_order = %d, want > %d (after existing1)", moved.SortOrder, existing1.SortOrder)
	}
	if moved.SortOrder <= existing2.SortOrder {
		t.Errorf("moved sort_order = %d, want > %d (after existing2)", moved.SortOrder, existing2.SortOrder)
	}
}

// TestMovePlanItemUpdatesStartTimeIntegration verifies that providing a new
// start_time in the move request replaces the existing one.
func TestMovePlanItemUpdatesStartTimeIntegration(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping move start_time update integration test")
	}

	srv := newModule(t)
	tripID := createTripForPlanItemTest(t, srv)
	day1ID := getDayID(t, srv, tripID, "2026-09-05")
	day2ID := getDayID(t, srv, tripID, "2026-09-06")

	body := fmt.Sprintf(`{"title":"Dinner","start_time":"19:00","day_id":%q}`, day1ID)
	pi := createPlanItem(t, srv, tripID, body)

	moved := movePlanItem(t, srv, tripID, pi.ID,
		fmt.Sprintf(`{"day_id":%q,"start_time":"20:30"}`, day2ID))

	if moved.StartTime == nil || *moved.StartTime != "20:30:00" {
		t.Errorf("moved start_time = %v, want 20:30:00", moved.StartTime)
	}
}

// TestMovePlanItemIdempotentIntegration verifies that replaying the same move
// request lands on the same day (converges).
func TestMovePlanItemIdempotentIntegration(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping move idempotency integration test")
	}

	srv := newModule(t)
	tripID := createTripForPlanItemTest(t, srv)
	day1ID := getDayID(t, srv, tripID, "2026-09-06")
	day2ID := getDayID(t, srv, tripID, "2026-09-07")

	pi := createPlanItem(t, srv, tripID, fmt.Sprintf(`{"title":"Walk","day_id":%q}`, day1ID))
	moveBody := fmt.Sprintf(`{"day_id":%q}`, day2ID)

	first := movePlanItem(t, srv, tripID, pi.ID, moveBody)
	second := movePlanItem(t, srv, tripID, pi.ID, moveBody)

	if first.DayID == nil || second.DayID == nil || *first.DayID != *second.DayID {
		t.Errorf("idempotent move: day_id %v vs %v, want same", first.DayID, second.DayID)
	}
}

// TestMovePlanItemAuthorizationDeniedIntegration verifies that a second user
// cannot move another user's plan item (404 — presence oracle).
func TestMovePlanItemAuthorizationDeniedIntegration(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping move authz integration test")
	}

	ownerID := freshOwnerID(t)
	otherID := freshOwnerID(t)

	ownerSrv := newModuleWithOwner(t, ownerID)
	tripID := createTripForPlanItemTest(t, ownerSrv)
	day1ID := getDayID(t, ownerSrv, tripID, "2026-09-01")
	day2ID := getDayID(t, ownerSrv, tripID, "2026-09-02")
	pi := createPlanItem(t, ownerSrv, tripID, fmt.Sprintf(`{"title":"Owner's item","day_id":%q}`, day1ID))

	otherSrv := newModuleWithOwner(t, otherID)
	movePath := fmt.Sprintf("%s/%s/plan-items/%s/move", TripsPath, tripID, pi.ID)
	resp := postJSON(t, otherSrv, movePath, json.RawMessage(fmt.Sprintf(`{"day_id":%q}`, day2ID)))
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("other move status = %d, want 404 (presence oracle)", resp.StatusCode)
	}
}

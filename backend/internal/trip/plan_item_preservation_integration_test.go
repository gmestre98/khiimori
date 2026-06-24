//go:build integration

// Integration tests for field/order preservation across promote/demote
// (M04.3 S3). They complement the round-trip smoke tests in
// plan_item_promote_integration_test.go with explicit coverage of:
//   - every non-scheduling field (cost, link, location, booking_status) surviving
//     both promote and demote unchanged;
//   - the demoted item reappearing in the backlog list (GET …/plan-items/backlog);
//   - no rows being created or deleted during the cycle (same id, same count).
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

// listBacklog calls GET …/plan-items/backlog and returns the decoded response.
func listBacklog(t *testing.T, srv *httptest.Server, tripID string) backlogResponse {
	t.Helper()
	resp, err := http.Get(fmt.Sprintf("%s%s/%s/plan-items/backlog", srv.URL, TripsPath, tripID))
	if err != nil {
		t.Fatalf("list backlog: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("list backlog status = %d, want 200", resp.StatusCode)
	}
	var b backlogResponse
	if err := json.NewDecoder(resp.Body).Decode(&b); err != nil {
		t.Fatalf("decode backlog response: %v", err)
	}
	return b
}

// TestAllFieldsPreservedThroughPromoteDemote creates an item with every
// optional field populated, promotes it, then demotes it back, asserting that
// cost, link, location, booking_status, title, and type survive both
// transitions intact.
func TestAllFieldsPreservedThroughPromoteDemote(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping preservation integration test")
	}

	srv := newModule(t)
	tripID := createTripForPlanItemTest(t, srv)
	dayID := getDayID(t, srv, tripID, "2026-09-01")

	body := `{
		"title":          "Visit the market",
		"type":           "food",
		"location":       "Mercado da Ribeira",
		"booking_status": "pending",
		"cost":           12.50,
		"link":           "https://example.com/market"
	}`
	pi := createPlanItem(t, srv, tripID, body)
	itemID := pi.ID

	// ── Promote ───────────────────────────────────────────────────────────────
	promoted := promotePlanItem(t, srv, tripID, itemID,
		fmt.Sprintf(`{"day_id":%q,"start_time":"09:00"}`, dayID))

	if promoted.ID != itemID {
		t.Errorf("promote: id = %q, want %q (same row)", promoted.ID, itemID)
	}
	if promoted.Title != "Visit the market" {
		t.Errorf("promote: title = %q, want Visit the market", promoted.Title)
	}
	if promoted.Type == nil || *promoted.Type != "food" {
		t.Errorf("promote: type = %v, want food", promoted.Type)
	}
	if promoted.Location == nil || *promoted.Location != "Mercado da Ribeira" {
		t.Errorf("promote: location = %v, want Mercado da Ribeira", promoted.Location)
	}
	if promoted.BookingStatus == nil || *promoted.BookingStatus != "pending" {
		t.Errorf("promote: booking_status = %v, want pending", promoted.BookingStatus)
	}
	if promoted.Cost == nil || *promoted.Cost != 12.50 {
		t.Errorf("promote: cost = %v, want 12.50", promoted.Cost)
	}
	if promoted.Link == nil || *promoted.Link != "https://example.com/market" {
		t.Errorf("promote: link = %v, want https://example.com/market", promoted.Link)
	}

	// ── Demote ────────────────────────────────────────────────────────────────
	demoted := demotePlanItem(t, srv, tripID, itemID)

	if demoted.ID != itemID {
		t.Errorf("demote: id = %q, want %q (same row)", demoted.ID, itemID)
	}
	if demoted.Title != "Visit the market" {
		t.Errorf("demote: title = %q, want Visit the market", demoted.Title)
	}
	if demoted.Type == nil || *demoted.Type != "food" {
		t.Errorf("demote: type = %v, want food", demoted.Type)
	}
	if demoted.Location == nil || *demoted.Location != "Mercado da Ribeira" {
		t.Errorf("demote: location = %v, want Mercado da Ribeira", demoted.Location)
	}
	if demoted.BookingStatus == nil || *demoted.BookingStatus != "pending" {
		t.Errorf("demote: booking_status = %v, want pending", demoted.BookingStatus)
	}
	if demoted.Cost == nil || *demoted.Cost != 12.50 {
		t.Errorf("demote: cost = %v, want 12.50", demoted.Cost)
	}
	if demoted.Link == nil || *demoted.Link != "https://example.com/market" {
		t.Errorf("demote: link = %v, want https://example.com/market", demoted.Link)
	}
}

// TestDemoteReturnsItemToBacklogList promotes a backlog item to a day, then
// demotes it, and asserts it is visible in the GET …/plan-items/backlog
// response — proving the demoted item is queryable as a backlog entry again.
func TestDemoteReturnsItemToBacklogList(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping preservation integration test")
	}

	srv := newModule(t)
	tripID := createTripForPlanItemTest(t, srv)
	dayID := getDayID(t, srv, tripID, "2026-09-03")

	pi := createPlanItem(t, srv, tripID, `{"title":"Ride the tram"}`)
	itemID := pi.ID

	// Backlog should contain the new item before promote.
	before := listBacklog(t, srv, tripID)
	found := false
	for _, it := range before.Items {
		if it.ID == itemID {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("item %q not found in backlog before promote", itemID)
	}

	// Promote → item leaves backlog.
	promotePlanItem(t, srv, tripID, itemID, fmt.Sprintf(`{"day_id":%q}`, dayID))

	afterPromote := listBacklog(t, srv, tripID)
	for _, it := range afterPromote.Items {
		if it.ID == itemID {
			t.Errorf("item %q still in backlog after promote, want removed", itemID)
		}
	}

	// Demote → item returns to backlog.
	demotePlanItem(t, srv, tripID, itemID)

	afterDemote := listBacklog(t, srv, tripID)
	found = false
	for _, it := range afterDemote.Items {
		if it.ID == itemID {
			found = true
			if it.DayID != nil {
				t.Errorf("demoted item has day_id = %v, want nil", it.DayID)
			}
			if it.Status != "idea" {
				t.Errorf("demoted item status = %q, want idea", it.Status)
			}
			break
		}
	}
	if !found {
		t.Errorf("item %q not found in backlog after demote", itemID)
	}
}

// TestPromoteDemoteNoRowsCreatedOrDeleted verifies that the backlog item count
// before and after a full promote-then-demote cycle is identical, and that the
// same row id is reused throughout (no silent create or delete).
func TestPromoteDemoteNoRowsCreatedOrDeleted(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping preservation integration test")
	}

	srv := newModule(t)
	tripID := createTripForPlanItemTest(t, srv)
	dayID := getDayID(t, srv, tripID, "2026-09-04")

	// Seed two backlog items so the count is non-trivial.
	pi1 := createPlanItem(t, srv, tripID, `{"title":"Idea A"}`)
	pi2 := createPlanItem(t, srv, tripID, `{"title":"Idea B"}`)

	countBefore := len(listBacklog(t, srv, tripID).Items)
	if countBefore != 2 {
		t.Fatalf("backlog count before = %d, want 2", countBefore)
	}

	// Promote pi1 — backlog shrinks by one.
	promoted := promotePlanItem(t, srv, tripID, pi1.ID, fmt.Sprintf(`{"day_id":%q}`, dayID))
	if promoted.ID != pi1.ID {
		t.Errorf("promote returned id = %q, want %q (same row)", promoted.ID, pi1.ID)
	}
	countAfterPromote := len(listBacklog(t, srv, tripID).Items)
	if countAfterPromote != 1 {
		t.Errorf("backlog count after promote = %d, want 1", countAfterPromote)
	}
	// pi2 must still be in the backlog.
	mid := listBacklog(t, srv, tripID)
	if mid.Items[0].ID != pi2.ID {
		t.Errorf("remaining backlog item id = %q, want %q", mid.Items[0].ID, pi2.ID)
	}

	// Demote pi1 — backlog returns to 2.
	demoted := demotePlanItem(t, srv, tripID, pi1.ID)
	if demoted.ID != pi1.ID {
		t.Errorf("demote returned id = %q, want %q (same row)", demoted.ID, pi1.ID)
	}
	countAfterDemote := len(listBacklog(t, srv, tripID).Items)
	if countAfterDemote != countBefore {
		t.Errorf("backlog count after demote = %d, want %d (restored)", countAfterDemote, countBefore)
	}
}

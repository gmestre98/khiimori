//go:build integration

// Integration tests for the backlog read endpoint (M04.3 S1). They drive the
// full handler → pgxPlanItemStore → DB path, covering ordering, authorization,
// and the day_id = null filter.
//
// Run with:
//
//	DATABASE_URL_TEST=<direct DSN> go test -tags=integration ./internal/trip/...
package trip

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
)

// TestListBacklogIntegration exercises the backlog list through the HTTP server
// → pgxPlanItemStore → real DB: creates a mix of backlog items (day_id = null)
// and a day-assigned item, and asserts the endpoint returns only backlog items
// ordered by sort_order.
func TestListBacklogIntegration(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping backlog integration test")
	}

	srv := newModule(t)
	tripID := createTripForPlanItemTest(t, srv)

	// Create two backlog items (no day_id).
	pi1 := createPlanItem(t, srv, tripID, `{"title":"Museum visit"}`)
	pi2 := createPlanItem(t, srv, tripID, `{"title":"Cooking class"}`)

	// Create a day-assigned item — must not appear in the backlog.
	dayResp := httpGet(t, srv, fmt.Sprintf("%s/%s/days/2026-09-01", TripsPath, tripID))
	defer dayResp.Body.Close()
	if dayResp.StatusCode != http.StatusOK {
		t.Fatalf("GET day status = %d, want 200", dayResp.StatusCode)
	}
	var day dayResponse
	if err := json.NewDecoder(dayResp.Body).Decode(&day); err != nil {
		t.Fatalf("decode day: %v", err)
	}
	createPlanItem(t, srv, tripID, fmt.Sprintf(`{"title":"Day item","day_id":%q}`, day.ID))

	// Fetch the backlog.
	backlogPath := fmt.Sprintf("%s/%s/plan-items/backlog", TripsPath, tripID)
	resp := httpGet(t, srv, backlogPath)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET backlog status = %d, want 200", resp.StatusCode)
	}

	var body backlogResponse
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode backlog response: %v", err)
	}

	if len(body.Items) != 2 {
		t.Fatalf("backlog items = %d, want 2 (day-assigned item must be excluded)", len(body.Items))
	}
	if body.Items[0].ID != pi1.ID {
		t.Errorf("items[0].id = %q, want %q (ordered by sort_order)", body.Items[0].ID, pi1.ID)
	}
	if body.Items[1].ID != pi2.ID {
		t.Errorf("items[1].id = %q, want %q (ordered by sort_order)", body.Items[1].ID, pi2.ID)
	}
	for _, item := range body.Items {
		if item.DayID != nil {
			t.Errorf("item %q has day_id = %v, want nil (backlog)", item.ID, item.DayID)
		}
		if item.Status != "idea" {
			t.Errorf("item %q status = %q, want idea (backlog default)", item.ID, item.Status)
		}
	}
}

// TestListBacklogAuthorizationDenied verifies that a second user cannot read
// another user's trip backlog (returns 404 — presence oracle).
func TestListBacklogAuthorizationDenied(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping backlog integration test")
	}

	ownerID := freshOwnerID(t)
	otherID := freshOwnerID(t)

	ownerSrv := newModuleWithOwner(t, ownerID)
	tripID := createTripForPlanItemTest(t, ownerSrv)
	createPlanItem(t, ownerSrv, tripID, `{"title":"Owner's idea"}`)

	otherSrv := newModuleWithOwner(t, otherID)
	backlogPath := fmt.Sprintf("%s/%s/plan-items/backlog", TripsPath, tripID)
	resp := httpGet(t, otherSrv, backlogPath)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("other user backlog status = %d, want 404 (presence oracle)", resp.StatusCode)
	}
}

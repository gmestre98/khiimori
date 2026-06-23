//go:build integration

// Integration tests for PlanItem create (M04.2 S4). They drive the full
// handler → pgxPlanItemStore → DB path through the HTTP server, covering
// title-only create, backlog (no day_id), timed create, and authorization.
//
// Run with:
//
//	DATABASE_URL_TEST=<direct DSN> go test -tags=integration ./internal/trip/...
package trip

import (
	"bytes"
	"fmt"
	"net/http"
	"testing"
)

// TestPlanItemCreateTitleOnlyIntegration verifies that a plan item can be
// created with only a title and lands as an untimed item with status "idea"
// (no day_id → backlog).
func TestPlanItemCreateTitleOnlyIntegration(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping plan item create integration test")
	}

	srv := newModule(t)
	tripID := createTripForPlanItemTest(t, srv)

	pi := createPlanItem(t, srv, tripID, `{"title":"Wander the streets"}`)
	if pi.ID == "" {
		t.Fatal("created plan item has no id")
	}
	if pi.Title != "Wander the streets" {
		t.Errorf("title = %q, want Wander the streets", pi.Title)
	}
	if pi.StartTime != nil {
		t.Errorf("start_time = %v, want nil (untimed)", pi.StartTime)
	}
	if pi.Duration != nil {
		t.Errorf("duration = %v, want nil", pi.Duration)
	}
	if pi.DayID != nil {
		t.Errorf("day_id = %v, want nil (backlog)", pi.DayID)
	}
	if pi.Status != "idea" {
		t.Errorf("status = %q, want idea (backlog default)", pi.Status)
	}
}

// TestPlanItemCreateTimedIntegration verifies that a plan item created with a
// start_time is stored as timed and the time is round-tripped correctly.
func TestPlanItemCreateTimedIntegration(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping plan item create integration test")
	}

	srv := newModule(t)
	tripID := createTripForPlanItemTest(t, srv)

	pi := createPlanItem(t, srv, tripID, `{"title":"Morning tour","start_time":"09:30","duration":"PT2H"}`)
	if pi.StartTime == nil || *pi.StartTime != "09:30:00" {
		t.Errorf("start_time = %v, want 09:30:00 (timed)", pi.StartTime)
	}
	if pi.Duration == nil || *pi.Duration != "PT2H" {
		t.Errorf("duration = %v, want PT2H", pi.Duration)
	}
}

// TestPlanItemCreateUnauthorizedIntegration verifies that a second user cannot
// create a plan item on another user's trip (returns 404 — presence oracle).
func TestPlanItemCreateUnauthorizedIntegration(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping plan item create integration test")
	}

	ownerID := freshOwnerID(t)
	otherID := freshOwnerID(t)

	ownerSrv := newModuleWithOwner(t, ownerID)
	tripID := createTripForPlanItemTest(t, ownerSrv)

	otherSrv := newModuleWithOwner(t, otherID)
	resp, err := http.Post(
		fmt.Sprintf("%s%s/%s/plan-items", otherSrv.URL, TripsPath, tripID),
		"application/json",
		bytes.NewBufferString(`{"title":"Hack"}`),
	)
	if err != nil {
		t.Fatalf("create plan item as other user: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404 (presence oracle protection)", resp.StatusCode)
	}
}

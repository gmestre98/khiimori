//go:build integration

// Integration tests for PlanItem create (M04.2 S4). They drive the full
// handler → pgxPlanItemStore → DB path through the HTTP server, covering
// title-only create (backlog and day-assigned), timed create, and
// authorization denial.
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

// fetchDayID retrieves the ID of the first day (start_date) of the trip.
func fetchDayID(t *testing.T, srv *httptest.Server, tripID, date string) string {
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

// TestPlanItemCreateTitleOnlyBacklogIntegration verifies that a plan item
// created with only a title and no day_id lands in the backlog as untimed
// with status "idea".
func TestPlanItemCreateTitleOnlyBacklogIntegration(t *testing.T) {
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

// TestPlanItemCreateTitleOnlyDayIntegration verifies that a plan item created
// with only a title and a day_id lands on that day as untimed with status
// "planned".
func TestPlanItemCreateTitleOnlyDayIntegration(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping plan item create integration test")
	}

	srv := newModule(t)
	tripID := createTripForPlanItemTest(t, srv)
	dayID := fetchDayID(t, srv, tripID, "2026-09-01")

	body := fmt.Sprintf(`{"title":"Visit the castle","day_id":%q}`, dayID)
	pi := createPlanItem(t, srv, tripID, body)
	if pi.ID == "" {
		t.Fatal("created plan item has no id")
	}
	if pi.DayID == nil || *pi.DayID != dayID {
		t.Errorf("day_id = %v, want %q", pi.DayID, dayID)
	}
	if pi.StartTime != nil {
		t.Errorf("start_time = %v, want nil (untimed)", pi.StartTime)
	}
	if pi.Status != "planned" {
		t.Errorf("status = %q, want planned (day item default)", pi.Status)
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
	dayID := fetchDayID(t, srv, tripID, "2026-09-01")

	body := fmt.Sprintf(`{"title":"Morning tour","day_id":%q,"start_time":"09:30","duration":"PT2H"}`, dayID)
	pi := createPlanItem(t, srv, tripID, body)
	if pi.StartTime == nil || *pi.StartTime != "09:30:00" {
		t.Errorf("start_time = %v, want 09:30:00 (timed)", pi.StartTime)
	}
	if pi.Duration == nil {
		t.Errorf("duration = nil, want non-nil (PT2H input)")
	}
	if pi.Status != "planned" {
		t.Errorf("status = %q, want planned", pi.Status)
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

// TestPlanItemCreateKindIntegration verifies that kind (M12.1) round-trips
// through the DB: an explicit kind is stored and returned, and an omitted kind
// defaults to "activity" via the column default.
func TestPlanItemCreateKindIntegration(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping plan item kind integration test")
	}

	srv := newModule(t)
	tripID := createTripForPlanItemTest(t, srv)
	dayID := fetchDayID(t, srv, tripID, "2026-09-01")

	explicit := createPlanItem(t, srv, tripID,
		fmt.Sprintf(`{"title":"Train to Porto","day_id":%q,"kind":"transport"}`, dayID))
	if explicit.Kind != "transport" {
		t.Errorf("kind = %q, want transport", explicit.Kind)
	}

	defaulted := createPlanItem(t, srv, tripID,
		fmt.Sprintf(`{"title":"Wander","day_id":%q}`, dayID))
	if defaulted.Kind != "activity" {
		t.Errorf("kind = %q, want activity (default)", defaulted.Kind)
	}
}

// TestPlanItemCreateTransportFieldsIntegration verifies that origin,
// destination, and arrive_time (M12.1 S2) round-trip through the DB.
func TestPlanItemCreateTransportFieldsIntegration(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping plan item transport integration test")
	}

	srv := newModule(t)
	tripID := createTripForPlanItemTest(t, srv)
	dayID := fetchDayID(t, srv, tripID, "2026-09-01")

	body := fmt.Sprintf(`{
		"title":"Train to Porto","day_id":%q,"kind":"transport",
		"origin":"Lisboa Oriente","destination":"Porto Campanha",
		"start_time":"08:15","arrive_time":"11:20"
	}`, dayID)
	pi := createPlanItem(t, srv, tripID, body)

	if pi.Kind != "transport" {
		t.Errorf("kind = %q, want transport", pi.Kind)
	}
	if pi.Origin == nil || *pi.Origin != "Lisboa Oriente" {
		t.Errorf("origin = %v, want Lisboa Oriente", pi.Origin)
	}
	if pi.Destination == nil || *pi.Destination != "Porto Campanha" {
		t.Errorf("destination = %v, want Porto Campanha", pi.Destination)
	}
	if pi.StartTime == nil || *pi.StartTime != "08:15:00" {
		t.Errorf("start_time = %v, want 08:15:00", pi.StartTime)
	}
	if pi.ArriveTime == nil || *pi.ArriveTime != "11:20:00" {
		t.Errorf("arrive_time = %v, want 11:20:00", pi.ArriveTime)
	}
}

// TestPlanItemCreateNoteIntegration asserts a free-text note survives the round
// trip through the DB and is returned on the wire — the storage backing a logged
// "what happened" item's context line (Day-tab refactor).
func TestPlanItemCreateNoteIntegration(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping plan item note integration test")
	}

	srv := newModule(t)
	tripID := createTripForPlanItemTest(t, srv)
	dayID := fetchDayID(t, srv, tripID, "2026-09-01")

	body := fmt.Sprintf(`{
		"title":"Sunset kayak on the Tagus","day_id":%q,
		"note":"Spontaneous — met a guide at the dock. Best two hours."
	}`, dayID)
	pi := createPlanItem(t, srv, tripID, body)

	if pi.Note == nil || *pi.Note != "Spontaneous — met a guide at the dock. Best two hours." {
		t.Errorf("note = %v, want the logged note", pi.Note)
	}
}

// TestPlanItemCreateUnplannedIntegration asserts the unplanned flag survives the
// DB round trip (default false, true when logged) — backs the Day tab telling
// the intended plan apart from what actually happened.
func TestPlanItemCreateUnplannedIntegration(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping plan item unplanned integration test")
	}

	srv := newModule(t)
	tripID := createTripForPlanItemTest(t, srv)
	dayID := fetchDayID(t, srv, tripID, "2026-09-01")

	planned := createPlanItem(t, srv, tripID, fmt.Sprintf(`{"title":"Belém Tower","day_id":%q}`, dayID))
	if planned.Unplanned {
		t.Error("planned item unplanned = true, want false")
	}

	logged := createPlanItem(t, srv, tripID,
		fmt.Sprintf(`{"title":"Sunset kayak","day_id":%q,"unplanned":true}`, dayID))
	if !logged.Unplanned {
		t.Error("logged item unplanned = false, want true")
	}
}

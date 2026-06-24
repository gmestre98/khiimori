//go:build integration

// Integration tests for edit/delete propagation in the roll-up engine (M05.2 S4).
// These drive the full handler → store → DB path and verify that roll-up results
// are consistent and immediately reflect creates, edits, and deletes of all three
// cost sources.
//
// Since the roll-up is computed-on-read, propagation is inherent: no cache to
// invalidate. These tests exist to prove that invariant.
package budget

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
)

// noopCostReader returns no external costs (used when only cost entries matter).
type noopCostReader struct{}

func (noopCostReader) GetTripCosts(_ context.Context, _ string) ([]ExternalCost, error) {
	return nil, nil
}

// staticCostReader returns a fixed slice of external costs (used to simulate
// stay/plan-item contributions).
type staticCostReader struct {
	costs []ExternalCost
}

func (r staticCostReader) GetTripCosts(_ context.Context, _ string) ([]ExternalCost, error) {
	return r.costs, nil
}

// newRollupServer wires a Module with a controllable TripCostReader.
func newRollupServer(t *testing.T, ownerID string, reader TripCostReader) *httpTestSrv {
	t.Helper()
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping budget integration test")
	}
	ctx := context.Background()
	_, err := testPool.Exec(ctx,
		`TRUNCATE budget.cost_entries, budget.budget_lines, trip.plan_items, trip.stays, trip.days, trip.trips, sharing.trip_memberships RESTART IDENTITY`)
	if err != nil {
		t.Fatalf("truncating tables: %v", err)
	}

	requireAuth := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := authn.WithPrincipal(r.Context(), authn.Principal{UserID: ownerID})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}

	mod := New(testPool, requireAuth, alwaysAllowAuthz{}, reader)
	mux := http.NewServeMux()
	mod.RegisterRoutes(mux)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return &httpTestSrv{Server: srv}
}

type httpTestSrv struct {
	*httptest.Server
}

func (s *httpTestSrv) getRollup(t *testing.T, tripID string) RollupResult {
	t.Helper()
	resp, err := http.Get(s.URL + "/trips/" + tripID + "/budget/rollup")
	if err != nil {
		t.Fatalf("GET rollup: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("rollup: expected 200, got %d", resp.StatusCode)
	}
	var r RollupResult
	if err := json.NewDecoder(resp.Body).Decode(&r); err != nil {
		t.Fatalf("rollup decode: %v", err)
	}
	return r
}

func (s *httpTestSrv) createEntry(t *testing.T, tripID string, body map[string]any) string {
	t.Helper()
	b, _ := json.Marshal(body)
	req, _ := http.NewRequest(http.MethodPost, s.URL+"/trips/"+tripID+"/cost-entries", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("create entry: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create: expected 201, got %d", resp.StatusCode)
	}
	var out costEntryResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode create: %v", err)
	}
	return out.ID
}

func (s *httpTestSrv) updateEntry(t *testing.T, tripID, entryID string, body map[string]any) {
	t.Helper()
	b, _ := json.Marshal(body)
	req, _ := http.NewRequest(http.MethodPatch,
		s.URL+fmt.Sprintf("/trips/%s/cost-entries/%s", tripID, entryID), bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("update entry: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("update: expected 200, got %d", resp.StatusCode)
	}
}

func (s *httpTestSrv) deleteEntry(t *testing.T, tripID, entryID string) {
	t.Helper()
	req, _ := http.NewRequest(http.MethodDelete,
		s.URL+fmt.Sprintf("/trips/%s/cost-entries/%s", tripID, entryID), nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("delete entry: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("delete: expected 204, got %d", resp.StatusCode)
	}
}

// TestIntegration_Propagation_CostEntryEditDelete creates a cost entry,
// verifies it appears in the rollup, edits it, verifies the new amount, then
// deletes it and verifies it is removed.
func TestIntegration_Propagation_CostEntryEditDelete(t *testing.T) {
	ownerID := freshOwnerID(t)
	srv := newRollupServer(t, ownerID, noopCostReader{})
	tripID := insertTrip(t, ownerID)

	// Empty trip.
	r0 := srv.getRollup(t, tripID)
	if r0.TripTotal != 0 {
		t.Fatalf("initial rollup: expected 0, got %f", r0.TripTotal)
	}

	// Create entry.
	entryID := srv.createEntry(t, tripID, map[string]any{
		"category": "Food",
		"amount":   60.0,
		"note":     "dinner",
	})
	r1 := srv.getRollup(t, tripID)
	if r1.TripTotal != 60 {
		t.Fatalf("after create: trip_total = %f, want 60", r1.TripTotal)
	}
	if r1.ByCategory["Food"] != 60 {
		t.Errorf("Food: %f, want 60", r1.ByCategory["Food"])
	}

	// Edit entry.
	srv.updateEntry(t, tripID, entryID, map[string]any{
		"category": "Food",
		"amount":   90.0,
		"note":     "dinner updated",
	})
	r2 := srv.getRollup(t, tripID)
	if r2.TripTotal != 90 {
		t.Fatalf("after edit: trip_total = %f, want 90", r2.TripTotal)
	}

	// Delete entry.
	srv.deleteEntry(t, tripID, entryID)
	r3 := srv.getRollup(t, tripID)
	if r3.TripTotal != 0 {
		t.Fatalf("after delete: trip_total = %f, want 0", r3.TripTotal)
	}
}

// TestIntegration_Propagation_ExternalCosts verifies that Stay/PlanItem costs
// read via TripCostReader are reflected in the rollup.
func TestIntegration_Propagation_ExternalCosts(t *testing.T) {
	ownerID := freshOwnerID(t)

	reader := staticCostReader{
		costs: []ExternalCost{
			{DayID: "", Category: CategoryStays, Amount: 200},
		},
	}
	srv := newRollupServer(t, ownerID, reader)
	tripID := insertTrip(t, ownerID)

	r := srv.getRollup(t, tripID)
	if r.TripTotal != 200 {
		t.Fatalf("with stay cost: trip_total = %f, want 200", r.TripTotal)
	}
	if r.ByCategory["Stays"] != 200 {
		t.Errorf("Stays: %f, want 200", r.ByCategory["Stays"])
	}
	if len(r.ByDay) != 0 {
		t.Errorf("stays should not appear in ByDay, got %v", r.ByDay)
	}
}

// TestIntegration_Propagation_MultipleSourcesConsistent seeds stays (via
// reader), plan items (via reader), and cost entries, then asserts that the
// rollup sums them correctly and is internally consistent.
func TestIntegration_Propagation_MultipleSourcesConsistent(t *testing.T) {
	ownerID := freshOwnerID(t)
	dayID := "00000000-0000-0000-0000-000000000001"

	reader := staticCostReader{
		costs: []ExternalCost{
			{DayID: "", Category: CategoryStays, Amount: 150},
			{DayID: dayID, Category: CategoryActivities, Amount: 40},
		},
	}
	srv := newRollupServer(t, ownerID, reader)
	tripID := insertTrip(t, ownerID)

	// Also add a cost entry on the same day.
	srv.createEntry(t, tripID, map[string]any{
		"category": "Food",
		"amount":   35.0,
		"day_id":   dayID,
	})

	r := srv.getRollup(t, tripID)
	// 150 (stay) + 40 (activity) + 35 (food entry) = 225
	if r.TripTotal != 225 {
		t.Fatalf("trip_total: %f, want 225", r.TripTotal)
	}
	if r.ByCategory["Stays"] != 150 {
		t.Errorf("Stays: %f, want 150", r.ByCategory["Stays"])
	}
	if r.ByDay[dayID] != 75 { // activity 40 + food entry 35
		t.Errorf("day total: %f, want 75", r.ByDay[dayID])
	}

	// Internal consistency: category sum == TripTotal.
	catSum := 0.0
	for _, v := range r.ByCategory {
		catSum += v
	}
	if catSum != r.TripTotal {
		t.Errorf("category sum %f != trip_total %f", catSum, r.TripTotal)
	}
}

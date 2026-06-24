//go:build integration

// Integration tests for plan-item reorder within a day (M04.4 S1). They drive
// the full handler → pgxPlanItemStore → DB path, covering reorder ordering,
// idempotency, and that timed/untimed items keep a stable combined sequence.
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

// reorderPlanItems calls POST …/plan-items/reorder and returns the ordered items.
func reorderPlanItemsIntegration(t *testing.T, srv *httptest.Server, tripID, body string) []planItemResponse {
	t.Helper()
	path := fmt.Sprintf("%s/%s/plan-items/reorder", TripsPath, tripID)
	resp := postJSON(t, srv, path, json.RawMessage(body))
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("reorder plan items status = %d, want 200", resp.StatusCode)
	}
	var result struct {
		Items []planItemResponse `json:"items"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("decode reorder response: %v", err)
	}
	return result.Items
}

// TestReorderPlanItemsIntegration creates three items on a day, reorders them,
// and verifies sort_order reflects the new sequence.
func TestReorderPlanItemsIntegration(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping reorder integration test")
	}

	srv := newModule(t)
	tripID := createTripForPlanItemTest(t, srv)
	dayID := getDayID(t, srv, tripID, "2026-09-01")

	// Create three items on the day (they land in sort_order 0, 1, 2).
	body := fmt.Sprintf(`{"title":"Item A","day_id":%q}`, dayID)
	itemA := createPlanItem(t, srv, tripID, body)
	body = fmt.Sprintf(`{"title":"Item B","day_id":%q}`, dayID)
	itemB := createPlanItem(t, srv, tripID, body)
	body = fmt.Sprintf(`{"title":"Item C","day_id":%q}`, dayID)
	itemC := createPlanItem(t, srv, tripID, body)

	// Reorder: C, A, B.
	reorderBody := fmt.Sprintf(`{"day_id":%q,"item_ids":[%q,%q,%q]}`,
		dayID, itemC.ID, itemA.ID, itemB.ID)
	items := reorderPlanItemsIntegration(t, srv, tripID, reorderBody)

	if len(items) != 3 {
		t.Fatalf("reorder returned %d items, want 3", len(items))
	}
	wantOrder := []string{itemC.ID, itemA.ID, itemB.ID}
	for i, item := range items {
		if item.ID != wantOrder[i] {
			t.Errorf("items[%d].id = %q, want %q", i, item.ID, wantOrder[i])
		}
		if item.SortOrder != i {
			t.Errorf("items[%d].sort_order = %d, want %d", i, item.SortOrder, i)
		}
	}
}

// TestReorderPlanItemsIdempotentIntegration verifies that replaying the same
// reorder request produces the same sort_order values (convergence).
func TestReorderPlanItemsIdempotentIntegration(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping reorder idempotency test")
	}

	srv := newModule(t)
	tripID := createTripForPlanItemTest(t, srv)
	dayID := getDayID(t, srv, tripID, "2026-09-02")

	body := fmt.Sprintf(`{"title":"X","day_id":%q}`, dayID)
	itemX := createPlanItem(t, srv, tripID, body)
	body = fmt.Sprintf(`{"title":"Y","day_id":%q}`, dayID)
	itemY := createPlanItem(t, srv, tripID, body)

	reorderBody := fmt.Sprintf(`{"day_id":%q,"item_ids":[%q,%q]}`, dayID, itemY.ID, itemX.ID)

	first := reorderPlanItemsIntegration(t, srv, tripID, reorderBody)
	second := reorderPlanItemsIntegration(t, srv, tripID, reorderBody)

	for i := range first {
		if first[i].SortOrder != second[i].SortOrder {
			t.Errorf("replay produced different sort_order at index %d: %d vs %d",
				i, first[i].SortOrder, second[i].SortOrder)
		}
	}
}

// TestReorderPlanItemsTimedUntimedIntegration verifies that reordering a mix
// of timed and untimed items yields a stable combined sequence.
func TestReorderPlanItemsTimedUntimedIntegration(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping timed/untimed reorder test")
	}

	srv := newModule(t)
	tripID := createTripForPlanItemTest(t, srv)
	dayID := getDayID(t, srv, tripID, "2026-09-03")

	// Untimed item.
	body := fmt.Sprintf(`{"title":"Untimed","day_id":%q}`, dayID)
	untimed := createPlanItem(t, srv, tripID, body)

	// Timed item.
	body = fmt.Sprintf(`{"title":"Timed","day_id":%q,"start_time":"09:00"}`, dayID)
	timed := createPlanItem(t, srv, tripID, body)

	// Reorder: timed first, then untimed.
	reorderBody := fmt.Sprintf(`{"day_id":%q,"item_ids":[%q,%q]}`, dayID, timed.ID, untimed.ID)
	items := reorderPlanItemsIntegration(t, srv, tripID, reorderBody)

	if len(items) != 2 {
		t.Fatalf("reorder returned %d items, want 2", len(items))
	}
	if items[0].ID != timed.ID || items[0].SortOrder != 0 {
		t.Errorf("items[0] = {id:%q sort_order:%d}, want timed item at 0", items[0].ID, items[0].SortOrder)
	}
	if items[1].ID != untimed.ID || items[1].SortOrder != 1 {
		t.Errorf("items[1] = {id:%q sort_order:%d}, want untimed item at 1", items[1].ID, items[1].SortOrder)
	}
}

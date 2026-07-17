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

// reorderActualOrderIntegration calls POST …/plan-items/reorder-actual and
// returns the items ordered by actual_order.
func reorderActualOrderIntegration(t *testing.T, srv *httptest.Server, tripID, body string) []planItemResponse {
	t.Helper()
	path := fmt.Sprintf("%s/%s/plan-items/reorder-actual", TripsPath, tripID)
	resp := postJSON(t, srv, path, json.RawMessage(body))
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("reorder actual order status = %d, want 200", resp.StatusCode)
	}
	var result struct {
		Items []planItemResponse `json:"items"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("decode actual-reorder response: %v", err)
	}
	return result.Items
}

// TestReorderActualOrderIndependentIntegration is the crux of the feature: the
// planned order (sort_order) and the "what happened" order (actual_order) move
// independently. It reorders the plan one way, the actual order another way, and
// checks each list reflects only its own reorder.
func TestReorderActualOrderIndependentIntegration(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping actual-order integration test")
	}

	srv := newModule(t)
	tripID := createTripForPlanItemTest(t, srv)
	dayID := getDayID(t, srv, tripID, "2026-09-05")

	a := createPlanItem(t, srv, tripID, fmt.Sprintf(`{"title":"A","day_id":%q}`, dayID))
	b := createPlanItem(t, srv, tripID, fmt.Sprintf(`{"title":"B","day_id":%q}`, dayID))
	c := createPlanItem(t, srv, tripID, fmt.Sprintf(`{"title":"C","day_id":%q}`, dayID))

	// Plan order: C, A, B (sort_order).
	planned := reorderPlanItemsIntegration(t, srv, tripID,
		fmt.Sprintf(`{"day_id":%q,"item_ids":[%q,%q,%q]}`, dayID, c.ID, a.ID, b.ID))
	wantPlan := []string{c.ID, a.ID, b.ID}
	for i, it := range planned {
		if it.ID != wantPlan[i] {
			t.Errorf("planned[%d].id = %q, want %q", i, it.ID, wantPlan[i])
		}
	}

	// Actual order: B, C, A (actual_order) — a different sequence.
	actual := reorderActualOrderIntegration(t, srv, tripID,
		fmt.Sprintf(`{"day_id":%q,"item_ids":[%q,%q,%q]}`, dayID, b.ID, c.ID, a.ID))
	wantActual := []string{b.ID, c.ID, a.ID}
	for i, it := range actual {
		if it.ID != wantActual[i] {
			t.Errorf("actual[%d].id = %q, want %q", i, it.ID, wantActual[i])
		}
		if it.ActualOrder != i {
			t.Errorf("actual[%d].actual_order = %d, want %d", i, it.ActualOrder, i)
		}
	}

	// The actual reorder must NOT have disturbed sort_order: re-fetch the day
	// (ListByDay orders by sort_order) and confirm the plan order is intact.
	items := getDayItems(t, srv, tripID, "2026-09-05")
	for i, it := range items {
		if it.ID != wantPlan[i] {
			t.Errorf("after actual reorder, day[%d].id = %q, want plan order %q", i, it.ID, wantPlan[i])
		}
	}
}

// getDayItems GETs a day and returns its plan items in server order.
func getDayItems(t *testing.T, srv *httptest.Server, tripID, date string) []planItemResponse {
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
	return d.PlanItems
}

// TestReorderInterleavesUntimedBetweenTimedIntegration verifies the unified
// timeline (M12.1 S6): an untimed item dragged between two timed items keeps
// that position when the day is re-fetched — ListByDay honours sort_order, so
// the untimed item is NOT forced to the end after the timed ones.
func TestReorderInterleavesUntimedBetweenTimedIntegration(t *testing.T) {
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping interleave integration test")
	}

	srv := newModule(t)
	tripID := createTripForPlanItemTest(t, srv)
	date := "2026-09-04"
	dayID := getDayID(t, srv, tripID, date)

	morning := createPlanItem(t, srv, tripID,
		fmt.Sprintf(`{"title":"Morning tour","day_id":%q,"start_time":"09:00"}`, dayID))
	afternoon := createPlanItem(t, srv, tripID,
		fmt.Sprintf(`{"title":"Afternoon museum","day_id":%q,"start_time":"15:00"}`, dayID))
	lunch := createPlanItem(t, srv, tripID,
		fmt.Sprintf(`{"title":"Lunch somewhere","day_id":%q}`, dayID)) // untimed

	// Arrange: morning, lunch (untimed, between), afternoon.
	reorderBody := fmt.Sprintf(`{"day_id":%q,"item_ids":[%q,%q,%q]}`,
		dayID, morning.ID, lunch.ID, afternoon.ID)
	reorderPlanItemsIntegration(t, srv, tripID, reorderBody)

	// Re-fetch the day: the untimed item must remain between the two timed ones.
	items := getDayItems(t, srv, tripID, date)
	if len(items) != 3 {
		t.Fatalf("day has %d items, want 3", len(items))
	}
	want := []string{morning.ID, lunch.ID, afternoon.ID}
	for i, it := range items {
		if it.ID != want[i] {
			t.Errorf("items[%d].id = %q (%q), want %q", i, it.ID, it.Title, want[i])
		}
	}
}

//go:build integration

// Integration tests for roll-up aggregation (M05.2 S5 — Epic AC5).
// Covers multi-level aggregation, all five categories, category mapping per
// source type, edit/delete propagation per source, and trip-vs-day budget
// line interaction.
//
// Uses the M01.3 harness (TestMain + testPool). Each test is hermetic:
// the helper truncates relevant tables at the start.
package budget

import (
	"context"
	"testing"
)

// ---- helpers ----------------------------------------------------------------

// insertStay inserts a trip.stays row and returns its id.
func insertStay(t *testing.T, tripID, name string, cost float64) string {
	t.Helper()
	var id string
	err := testPool.QueryRow(context.Background(), `
		INSERT INTO trip.stays (trip_id, name, cost)
		VALUES ($1::uuid, $2, $3)
		RETURNING id::text`, tripID, name, cost).Scan(&id)
	if err != nil {
		t.Fatalf("insert stay: %v", err)
	}
	return id
}

// insertPlanItem inserts a trip.plan_items row and returns its id. The item is
// marked done so its cost counts as spent — the roll-up only counts happened
// costs (M12.2 S1); tests that need estimated/skipped behaviour set status
// explicitly via setPlanItemStatus.
func insertPlanItem(t *testing.T, tripID, dayID, itemType string, cost float64) string {
	t.Helper()
	var id string
	var err error
	if dayID == "" {
		err = testPool.QueryRow(context.Background(), `
			INSERT INTO trip.plan_items (trip_id, title, type, cost, status)
			VALUES ($1::uuid, 'item', $2, $3, 'done')
			RETURNING id::text`, tripID, itemType, cost).Scan(&id)
	} else {
		err = testPool.QueryRow(context.Background(), `
			INSERT INTO trip.plan_items (trip_id, day_id, title, type, cost, status)
			VALUES ($1::uuid, $2::uuid, 'item', $3, $4, 'done')
			RETURNING id::text`, tripID, dayID, itemType, cost).Scan(&id)
	}
	if err != nil {
		t.Fatalf("insert plan item: %v", err)
	}
	return id
}

// setPlanItemStatus updates the lifecycle status of an existing plan item — used
// by roll-up tests to exercise the spent/estimated/excluded bucketing.
func setPlanItemStatus(t *testing.T, itemID, status string) {
	t.Helper()
	_, err := testPool.Exec(context.Background(),
		`UPDATE trip.plan_items SET status = $1 WHERE id = $2::uuid`, status, itemID)
	if err != nil {
		t.Fatalf("set plan item status: %v", err)
	}
}

// updateStayCost updates the cost field of an existing stay.
func updateStayCost(t *testing.T, stayID string, cost float64) {
	t.Helper()
	_, err := testPool.Exec(context.Background(),
		`UPDATE trip.stays SET cost = $1 WHERE id = $2::uuid`, cost, stayID)
	if err != nil {
		t.Fatalf("update stay cost: %v", err)
	}
}

// deleteStay removes a stay row.
func deleteStay(t *testing.T, stayID string) {
	t.Helper()
	_, err := testPool.Exec(context.Background(),
		`DELETE FROM trip.stays WHERE id = $1::uuid`, stayID)
	if err != nil {
		t.Fatalf("delete stay: %v", err)
	}
}

// updatePlanItemCost updates the cost field of an existing plan item.
func updatePlanItemCost(t *testing.T, itemID string, cost float64) {
	t.Helper()
	_, err := testPool.Exec(context.Background(),
		`UPDATE trip.plan_items SET cost = $1 WHERE id = $2::uuid`, cost, itemID)
	if err != nil {
		t.Fatalf("update plan item cost: %v", err)
	}
}

// deletePlanItem removes a plan item row.
func deletePlanItem(t *testing.T, itemID string) {
	t.Helper()
	_, err := testPool.Exec(context.Background(),
		`DELETE FROM trip.plan_items WHERE id = $1::uuid`, itemID)
	if err != nil {
		t.Fatalf("delete plan item: %v", err)
	}
}

// newRealCostReaderServer wires a Module with the real tripCostReaderAdapter
// from cmd/api, but that adapter lives outside this package. Instead we use a
// liveDBCostReader that queries trip.* directly — this is test-internal and
// acceptable since it is not production code crossing the module boundary.
type liveDBCostReader struct{}

func (liveDBCostReader) GetTripCosts(ctx context.Context, tripID string) ([]ExternalCost, error) {
	var out []ExternalCost

	stayRows, err := testPool.Query(ctx,
		`SELECT COALESCE(cost, 0) FROM trip.stays
		 WHERE trip_id = $1::uuid AND cost IS NOT NULL AND cost > 0`, tripID)
	if err != nil {
		return nil, err
	}
	defer stayRows.Close()
	for stayRows.Next() {
		var amount float64
		if err := stayRows.Scan(&amount); err != nil {
			return nil, err
		}
		out = append(out, ExternalCost{DayID: "", Category: CategoryStays, Amount: amount, Happened: true})
	}
	if err := stayRows.Err(); err != nil {
		return nil, err
	}

	// Mirror the composition-root reader (M12.2 S1): drop skipped/cancelled and
	// mark a cost spent only when the item is done.
	itemRows, err := testPool.Query(ctx,
		`SELECT COALESCE(day_id::text, ''), COALESCE(type, ''), COALESCE(cost, 0), status
		 FROM trip.plan_items
		 WHERE trip_id = $1::uuid AND cost IS NOT NULL AND cost > 0
		   AND status NOT IN ('skipped', 'cancelled')`, tripID)
	if err != nil {
		return nil, err
	}
	defer itemRows.Close()
	for itemRows.Next() {
		var dayID, itemType, status string
		var amount float64
		if err := itemRows.Scan(&dayID, &itemType, &amount, &status); err != nil {
			return nil, err
		}
		out = append(out, ExternalCost{
			DayID:    dayID,
			Category: planItemCategoryTest(itemType),
			Amount:   amount,
			Happened: status == "done",
		})
	}
	return out, itemRows.Err()
}

// planItemCategoryTest mirrors the composition-root mapping so tests stay
// in sync without importing cmd/api.
func planItemCategoryTest(itemType string) Category {
	switch itemType {
	case "transport", "flight", "train", "bus", "car", "ferry":
		return CategoryTransport
	case "food", "restaurant", "cafe", "meal", "drink":
		return CategoryFood
	case "activity", "tour", "sightseeing", "museum", "entertainment":
		return CategoryActivities
	case "stay", "hotel", "accommodation", "hostel", "airbnb":
		return CategoryStays
	default:
		return CategoryOther
	}
}

// newLiveServer wires a Module with the liveDBCostReader (reads live trip.* tables).
func newLiveServer(t *testing.T, ownerID string) *httpTestSrv {
	t.Helper()
	return newRollupServer(t, ownerID, liveDBCostReader{})
}

// ---- multi-level aggregation ------------------------------------------------

// TestIntegration_Rollup_AllCategories seeds one cost entry per category and
// asserts each appears in ByCategory with the correct amount.
func TestIntegration_Rollup_AllCategories(t *testing.T) {
	ownerID := freshOwnerID(t)
	srv := newRollupServer(t, ownerID, noopCostReader{})
	tripID := insertTrip(t, ownerID)

	cats := []struct {
		cat    string
		amount float64
	}{
		{"Stays", 100},
		{"Transport", 50},
		{"Food", 30},
		{"Activities", 80},
		{"Other", 20},
	}
	for _, c := range cats {
		srv.createEntry(t, tripID, map[string]any{"category": c.cat, "amount": c.amount})
	}

	r := srv.getRollup(t, tripID)
	want := 100.0 + 50 + 30 + 80 + 20
	if r.TripTotal != want {
		t.Errorf("trip_total: got %f, want %f", r.TripTotal, want)
	}
	for _, c := range cats {
		if r.ByCategory[c.cat] != c.amount {
			t.Errorf("ByCategory[%s]: got %f, want %f", c.cat, r.ByCategory[c.cat], c.amount)
		}
	}
}

// TestIntegration_Rollup_PerDayAggregation seeds cost entries across two days
// and a trip-level entry, asserting ByDay correctness.
func TestIntegration_Rollup_PerDayAggregation(t *testing.T) {
	ownerID := freshOwnerID(t)
	srv := newRollupServer(t, ownerID, noopCostReader{})
	tripID := insertTrip(t, ownerID)
	dayID := insertDay(t, tripID)

	// Day-level entries.
	srv.createEntry(t, tripID, map[string]any{"category": "Food", "amount": 40.0, "day_id": dayID})
	srv.createEntry(t, tripID, map[string]any{"category": "Transport", "amount": 25.0, "day_id": dayID})
	// Trip-level entry (no day).
	srv.createEntry(t, tripID, map[string]any{"category": "Stays", "amount": 200.0})

	r := srv.getRollup(t, tripID)
	if r.TripTotal != 265 {
		t.Errorf("trip_total: got %f, want 265", r.TripTotal)
	}
	if r.ByDay[dayID] != 65 {
		t.Errorf("day total: got %f, want 65", r.ByDay[dayID])
	}
	// Stays (trip-level) must NOT appear in ByDay.
	if _, ok := r.ByDay[""]; ok {
		t.Errorf("empty-string key must not appear in ByDay")
	}
	if r.ByCategoryDay[dayID]["Food"] != 40 {
		t.Errorf("day Food: got %f, want 40", r.ByCategoryDay[dayID]["Food"])
	}
	if r.ByCategoryDay[dayID]["Transport"] != 25 {
		t.Errorf("day Transport: got %f, want 25", r.ByCategoryDay[dayID]["Transport"])
	}
}

// TestIntegration_Rollup_MultiDay asserts that costs on different days are
// summed into the correct per-day buckets.
func TestIntegration_Rollup_MultiDay(t *testing.T) {
	ownerID := freshOwnerID(t)
	srv := newRollupServer(t, ownerID, noopCostReader{})
	tripID := insertTrip(t, ownerID)
	day1 := insertDay(t, tripID)
	day2 := insertDay2(t, tripID)

	srv.createEntry(t, tripID, map[string]any{"category": "Food", "amount": 30.0, "day_id": day1})
	srv.createEntry(t, tripID, map[string]any{"category": "Activities", "amount": 60.0, "day_id": day2})

	r := srv.getRollup(t, tripID)
	if r.TripTotal != 90 {
		t.Errorf("trip_total: %f, want 90", r.TripTotal)
	}
	if r.ByDay[day1] != 30 {
		t.Errorf("day1: %f, want 30", r.ByDay[day1])
	}
	if r.ByDay[day2] != 60 {
		t.Errorf("day2: %f, want 60", r.ByDay[day2])
	}
}

// ---- category mapping per source --------------------------------------------

// TestIntegration_Rollup_CategoryMapping_Stays verifies that a stay is mapped
// to CategoryStays and contributes to TripTotal (trip-level, not in ByDay).
func TestIntegration_Rollup_CategoryMapping_Stays(t *testing.T) {
	ownerID := freshOwnerID(t)
	srv := newLiveServer(t, ownerID)
	tripID := insertTrip(t, ownerID)
	insertStay(t, tripID, "Hotel Ulaanbaatar", 150)

	r := srv.getRollup(t, tripID)
	if r.ByCategory["Stays"] != 150 {
		t.Errorf("Stays category: %f, want 150", r.ByCategory["Stays"])
	}
	if len(r.ByDay) != 0 {
		t.Errorf("stay must not appear in ByDay, got %v", r.ByDay)
	}
}

// TestIntegration_Rollup_CategoryMapping_PlanItems verifies that plan items of
// each relevant type map to the correct budget category.
func TestIntegration_Rollup_CategoryMapping_PlanItems(t *testing.T) {
	ownerID := freshOwnerID(t)
	srv := newLiveServer(t, ownerID)
	tripID := insertTrip(t, ownerID)
	dayID := insertDay(t, tripID)

	items := []struct {
		itemType string
		cost     float64
		wantCat  string
	}{
		{"transport", 30, "Transport"},
		{"activity", 50, "Activities"},
		{"food", 20, "Food"},
		{"hotel", 100, "Stays"},
		{"unknown", 10, "Other"},
	}
	for _, item := range items {
		insertPlanItem(t, tripID, dayID, item.itemType, item.cost)
	}

	r := srv.getRollup(t, tripID)
	for _, item := range items {
		if r.ByCategory[item.wantCat] < item.cost {
			t.Errorf("plan item type=%q: ByCategory[%s]=%f, want at least %f",
				item.itemType, item.wantCat, r.ByCategory[item.wantCat], item.cost)
		}
	}
}

// ---- edit/delete propagation per source -------------------------------------

// TestIntegration_Rollup_Propagation_Stay verifies that editing and deleting a
// stay updates the rollup immediately.
func TestIntegration_Rollup_Propagation_Stay(t *testing.T) {
	ownerID := freshOwnerID(t)
	srv := newLiveServer(t, ownerID)
	tripID := insertTrip(t, ownerID)
	stayID := insertStay(t, tripID, "Hostel", 100)

	r1 := srv.getRollup(t, tripID)
	if r1.TripTotal != 100 {
		t.Fatalf("after insert: %f, want 100", r1.TripTotal)
	}

	updateStayCost(t, stayID, 80)
	r2 := srv.getRollup(t, tripID)
	if r2.TripTotal != 80 {
		t.Fatalf("after update: %f, want 80", r2.TripTotal)
	}

	deleteStay(t, stayID)
	r3 := srv.getRollup(t, tripID)
	if r3.TripTotal != 0 {
		t.Fatalf("after delete: %f, want 0", r3.TripTotal)
	}
}

// TestIntegration_Rollup_Propagation_PlanItem verifies that editing and deleting
// a plan item updates the rollup immediately.
func TestIntegration_Rollup_Propagation_PlanItem(t *testing.T) {
	ownerID := freshOwnerID(t)
	srv := newLiveServer(t, ownerID)
	tripID := insertTrip(t, ownerID)
	dayID := insertDay(t, tripID)
	itemID := insertPlanItem(t, tripID, dayID, "activity", 60)

	r1 := srv.getRollup(t, tripID)
	if r1.ByDay[dayID] != 60 {
		t.Fatalf("after insert: day total %f, want 60", r1.ByDay[dayID])
	}

	updatePlanItemCost(t, itemID, 45)
	r2 := srv.getRollup(t, tripID)
	if r2.ByDay[dayID] != 45 {
		t.Fatalf("after update: day total %f, want 45", r2.ByDay[dayID])
	}

	deletePlanItem(t, itemID)
	r3 := srv.getRollup(t, tripID)
	if _, ok := r3.ByDay[dayID]; ok {
		t.Fatalf("after delete: day should not appear in ByDay, got %v", r3.ByDay)
	}
}

// TestIntegration_Rollup_SpentVsEstimated verifies end-to-end that a plan item's
// cost only counts as spent once it is done: an idea/planned item is estimated,
// a skipped item drops out entirely, and marking it done moves the cost from
// estimated to spent (M12.2 S1).
func TestIntegration_Rollup_SpentVsEstimated(t *testing.T) {
	ownerID := freshOwnerID(t)
	srv := newLiveServer(t, ownerID)
	tripID := insertTrip(t, ownerID)
	dayID := insertDay(t, tripID)

	// insertPlanItem creates the item as done; put it back to planned so it is
	// an upcoming estimate rather than spent.
	itemID := insertPlanItem(t, tripID, dayID, "activity", 60)
	setPlanItemStatus(t, itemID, "planned")

	r1 := srv.getRollup(t, tripID)
	if r1.TripTotal != 0 {
		t.Fatalf("planned item must not be spent: TripTotal=%f, want 0", r1.TripTotal)
	}
	if r1.EstimatedByDay[dayID] != 60 {
		t.Fatalf("planned item must be estimated: EstimatedByDay=%f, want 60", r1.EstimatedByDay[dayID])
	}

	// Mark done → moves to spent.
	setPlanItemStatus(t, itemID, "done")
	r2 := srv.getRollup(t, tripID)
	if r2.ByDay[dayID] != 60 {
		t.Fatalf("done item must be spent: ByDay=%f, want 60", r2.ByDay[dayID])
	}
	if r2.EstimatedTripTotal != 0 {
		t.Fatalf("done item must leave estimated: EstimatedTripTotal=%f, want 0", r2.EstimatedTripTotal)
	}

	// Skip → drops out of both spent and estimated.
	setPlanItemStatus(t, itemID, "skipped")
	r3 := srv.getRollup(t, tripID)
	if r3.TripTotal != 0 || r3.EstimatedTripTotal != 0 {
		t.Fatalf("skipped item must vanish: spent=%f estimated=%f, want 0/0", r3.TripTotal, r3.EstimatedTripTotal)
	}
}

// ---- trip-vs-day budget interaction -----------------------------------------

// TestIntegration_Rollup_TripVsDay verifies that trip-level budget lines (stays,
// trip-level cost entries) and per-day entries are summed correctly in TripTotal
// while only day-level items appear in ByDay.
func TestIntegration_Rollup_TripVsDay(t *testing.T) {
	ownerID := freshOwnerID(t)
	srv := newRollupServer(t, ownerID, noopCostReader{})
	tripID := insertTrip(t, ownerID)
	dayID := insertDay(t, tripID)

	// Trip-level planned cost (e.g. accommodation booked for whole trip).
	srv.createEntry(t, tripID, map[string]any{"category": "Stays", "amount": 300.0})
	// Day-level activities.
	srv.createEntry(t, tripID, map[string]any{"category": "Activities", "amount": 50.0, "day_id": dayID})
	// Day-level food.
	srv.createEntry(t, tripID, map[string]any{"category": "Food", "amount": 25.0, "day_id": dayID})

	r := srv.getRollup(t, tripID)
	// All costs contribute to TripTotal.
	if r.TripTotal != 375 {
		t.Errorf("trip_total: %f, want 375", r.TripTotal)
	}
	// Only day-level costs appear in ByDay.
	if r.ByDay[dayID] != 75 {
		t.Errorf("day total: %f, want 75", r.ByDay[dayID])
	}
	// Trip-level stays must NOT inflate ByDay.
	if _, ok := r.ByDay[""]; ok {
		t.Errorf("empty-string key must not appear in ByDay")
	}
	// Stays appear in ByCategory.
	if r.ByCategory["Stays"] != 300 {
		t.Errorf("Stays: %f, want 300", r.ByCategory["Stays"])
	}
}

// ---- helpers for multi-day tests --------------------------------------------

// insertDay2 inserts a second trip.days row on a different date.
func insertDay2(t *testing.T, tripID string) string {
	t.Helper()
	var dayID string
	err := testPool.QueryRow(context.Background(), `
		INSERT INTO trip.days (trip_id, date, index)
		VALUES ($1::uuid, '2026-07-02', 1)
		RETURNING id::text`, tripID).Scan(&dayID)
	if err != nil {
		t.Fatalf("insert day2: %v", err)
	}
	return dayID
}

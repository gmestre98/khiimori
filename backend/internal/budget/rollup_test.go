package budget

import (
	"testing"
	"time"
)

// TestComputeRollup_EditPropagation verifies that changing an entry's amount in
// the input slice is immediately reflected in the computed result (compute-on-read
// propagation is inherent — no cache to invalidate).
func TestComputeRollup_EditPropagation(t *testing.T) {
	t.Parallel()

	initial := []CostEntry{
		{TripID: "t1", DayID: "d1", Category: CategoryFood, Amount: 50, CreatedAt: time.Now()},
	}
	r1 := computeRollup(nil, initial, nil)
	if r1.TripTotal != 50 {
		t.Fatalf("before edit: trip_total = %f, want 50", r1.TripTotal)
	}

	// Simulate an edit: replace entry with updated amount.
	edited := []CostEntry{
		{TripID: "t1", DayID: "d1", Category: CategoryFood, Amount: 75, CreatedAt: time.Now()},
	}
	r2 := computeRollup(nil, edited, nil)
	if r2.TripTotal != 75 {
		t.Fatalf("after edit: trip_total = %f, want 75", r2.TripTotal)
	}
	if r2.ByCategory["Food"] != 75 {
		t.Errorf("Food category: %f, want 75", r2.ByCategory["Food"])
	}
	if r2.ByDay["d1"] != 75 {
		t.Errorf("day total: %f, want 75", r2.ByDay["d1"])
	}
}

// TestComputeRollup_DeletePropagation verifies that removing an entry from the
// input slice drops its contribution from the roll-up.
func TestComputeRollup_DeletePropagation(t *testing.T) {
	t.Parallel()

	entries := []CostEntry{
		{TripID: "t1", DayID: "d1", Category: CategoryFood, Amount: 30, CreatedAt: time.Now()},
		{TripID: "t1", DayID: "d1", Category: CategoryTransport, Amount: 20, CreatedAt: time.Now()},
	}
	r1 := computeRollup(nil, entries, nil)
	if r1.TripTotal != 50 {
		t.Fatalf("before delete: trip_total = %f, want 50", r1.TripTotal)
	}

	// Simulate a delete: remove the Food entry.
	afterDelete := []CostEntry{entries[1]}
	r2 := computeRollup(nil, afterDelete, nil)
	if r2.TripTotal != 20 {
		t.Fatalf("after delete: trip_total = %f, want 20", r2.TripTotal)
	}
	if _, ok := r2.ByCategory["Food"]; ok {
		t.Errorf("Food category should be absent after delete, got %f", r2.ByCategory["Food"])
	}
}

// TestComputeRollup_StayPropagation verifies that stay costs (external, trip-level)
// appear in TripTotal and ByCategory but NOT in ByDay.
func TestComputeRollup_StayPropagation(t *testing.T) {
	t.Parallel()

	external := []ExternalCost{
		{DayID: "", Category: CategoryStays, Amount: 200, Happened: true},
	}
	r := computeRollup(external, nil, nil)
	if r.TripTotal != 200 {
		t.Fatalf("trip_total: %f, want 200", r.TripTotal)
	}
	if r.ByCategory["Stays"] != 200 {
		t.Errorf("Stays: %f, want 200", r.ByCategory["Stays"])
	}
	if len(r.ByDay) != 0 {
		t.Errorf("ByDay should be empty for trip-level stays, got %v", r.ByDay)
	}

	// Simulate "editing" the stay cost (new external value in next request).
	externalEdited := []ExternalCost{
		{DayID: "", Category: CategoryStays, Amount: 150, Happened: true},
	}
	r2 := computeRollup(externalEdited, nil, nil)
	if r2.TripTotal != 150 {
		t.Fatalf("after stay edit: trip_total = %f, want 150", r2.TripTotal)
	}
}

// TestComputeRollup_PlanItemPropagation verifies that plan-item costs (external,
// day-level) appear in both ByDay and TripTotal, and that editing/deleting them
// is reflected immediately.
func TestComputeRollup_PlanItemPropagation(t *testing.T) {
	t.Parallel()

	external := []ExternalCost{
		{DayID: "d1", Category: CategoryActivities, Amount: 80, Happened: true},
	}
	r := computeRollup(external, nil, nil)
	if r.ByDay["d1"] != 80 {
		t.Fatalf("day total: %f, want 80", r.ByDay["d1"])
	}

	// Simulate plan item deletion (no external costs).
	r2 := computeRollup(nil, nil, nil)
	if r2.TripTotal != 0 {
		t.Fatalf("after delete: trip_total = %f, want 0", r2.TripTotal)
	}
}

// TestComputeRollup_SpentVsEstimated verifies that external costs are bucketed by
// their Happened flag: happened costs land in the spent totals, not-happened costs
// land in the estimated totals, and manual cost entries are always spent.
func TestComputeRollup_SpentVsEstimated(t *testing.T) {
	t.Parallel()

	external := []ExternalCost{
		// A done activity — spent.
		{DayID: "d1", Category: CategoryActivities, Amount: 60, Happened: true},
		// A planned (not-yet-done) activity on the same day — estimated.
		{DayID: "d1", Category: CategoryActivities, Amount: 90, Happened: false},
		// An unpaid stay, trip-level — estimated, must not touch ByDay.
		{DayID: "", Category: CategoryStays, Amount: 200, Happened: false},
	}
	entries := []CostEntry{
		// Manual cost entries always count as spent.
		{DayID: "d1", Category: CategoryFood, Amount: 15, CreatedAt: time.Now()},
	}
	r := computeRollup(external, entries, nil)

	// Spent = done activity (60) + manual food (15).
	if r.TripTotal != 75 {
		t.Errorf("TripTotal (spent) = %f, want 75", r.TripTotal)
	}
	if r.ByCategory["Activities"] != 60 {
		t.Errorf("spent Activities = %f, want 60", r.ByCategory["Activities"])
	}
	if r.ByDay["d1"] != 75 {
		t.Errorf("spent ByDay[d1] = %f, want 75", r.ByDay["d1"])
	}

	// Estimated = planned activity (90) + unpaid stay (200).
	if r.EstimatedTripTotal != 290 {
		t.Errorf("EstimatedTripTotal = %f, want 290", r.EstimatedTripTotal)
	}
	if r.EstimatedByCategory["Activities"] != 90 {
		t.Errorf("estimated Activities = %f, want 90", r.EstimatedByCategory["Activities"])
	}
	if r.EstimatedByCategory["Stays"] != 200 {
		t.Errorf("estimated Stays = %f, want 200", r.EstimatedByCategory["Stays"])
	}
	// The unpaid stay is trip-level, so only the planned activity hits ByDay.
	if r.EstimatedByDay["d1"] != 90 {
		t.Errorf("estimated ByDay[d1] = %f, want 90", r.EstimatedByDay["d1"])
	}
	if _, ok := r.EstimatedByDay[""]; ok {
		t.Errorf("estimated ByDay must not contain a trip-level key")
	}
}

// TestComputeRollup_ConsistentWithinRequest verifies that a single computeRollup
// call is internally consistent: ByDay sums and ByCategory sums agree with
// TripTotal.
func TestComputeRollup_ConsistentWithinRequest(t *testing.T) {
	t.Parallel()

	external := []ExternalCost{
		{DayID: "", Category: CategoryStays, Amount: 100, Happened: true},
		{DayID: "d1", Category: CategoryActivities, Amount: 60, Happened: true},
		{DayID: "d2", Category: CategoryFood, Amount: 40, Happened: true},
	}
	entries := []CostEntry{
		{DayID: "d1", Category: CategoryTransport, Amount: 25, CreatedAt: time.Now()},
		{DayID: "", Category: CategoryOther, Amount: 10, CreatedAt: time.Now()},
	}
	r := computeRollup(external, entries, nil)

	// TripTotal must equal sum of all ByCategory values.
	catSum := 0.0
	for _, v := range r.ByCategory {
		catSum += v
	}
	if catSum != r.TripTotal {
		t.Errorf("ByCategory sum %f != TripTotal %f", catSum, r.TripTotal)
	}

	// TripTotal must equal ByDay sum plus trip-level contributions (stays + other entry).
	daySum := 0.0
	for _, v := range r.ByDay {
		daySum += v
	}
	tripLevel := 100.0 + 10.0 // stay + Other entry (both DayID == "")
	if daySum+tripLevel != r.TripTotal {
		t.Errorf("daySum(%f) + tripLevel(%f) != TripTotal(%f)", daySum, tripLevel, r.TripTotal)
	}

	// ByCategoryDay["d1"] must sum to ByDay["d1"].
	d1CatSum := 0.0
	for _, v := range r.ByCategoryDay["d1"] {
		d1CatSum += v
	}
	if d1CatSum != r.ByDay["d1"] {
		t.Errorf("d1 category sum %f != d1 day total %f", d1CatSum, r.ByDay["d1"])
	}
}

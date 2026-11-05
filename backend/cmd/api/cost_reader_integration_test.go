//go:build integration

package main

import (
	"context"
	"testing"
)

// TestTripCostReader_BookingStatus checks the spent/estimate rule: a cost is
// spent when paid or done; skipped/cancelled drop out unless paid.
func TestTripCostReader_BookingStatus(t *testing.T) {
	if authzTestPool == nil {
		t.Skip("DATABASE_URL_TEST not set")
	}
	truncateAll(t)
	owner := genID(t)
	tripID := setupTrip(t, owner)
	ctx := context.Background()
	exec := func(q string, args ...any) {
		t.Helper()
		if _, err := authzTestPool.Exec(ctx, q, args...); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	// title, booking, status, cost
	for _, r := range []struct {
		title, booking, status string
		cost                   float64
	}{
		{"paid planned", "paid", "planned", 10},
		{"booked planned", "booked", "planned", 20},
		{"none done", "none", "done", 40},
		{"paid cancelled", "paid", "cancelled", 80},
		{"booked skipped", "booked", "skipped", 160},
	} {
		exec(`INSERT INTO trip.plan_items (trip_id, title, booking_status, status, cost) VALUES ($1::uuid, $2, $3, $4, $5)`,
			tripID, r.title, r.booking, r.status, r.cost)
	}
	exec(`INSERT INTO trip.stays (trip_id, name, booking_status, paid, cost) VALUES
		($1::uuid, 'paid stay', 'paid', true, 300), ($1::uuid, 'booked stay', 'booked', false, 600)`, tripID)

	costs, err := tripCostReaderAdapter{pool: authzTestPool}.GetTripCosts(ctx, tripID)
	if err != nil {
		t.Fatal(err)
	}
	var spent, estimate float64
	for _, c := range costs {
		if c.Happened {
			spent += c.Amount
		} else {
			estimate += c.Amount
		}
	}
	// spent: 10 (paid) + 40 (done) + 80 (paid, cancelled) + 300 (paid stay)
	// estimate: 20 (booked) + 600 (booked stay); 160 (skipped, unpaid) dropped
	if spent != 430 || estimate != 620 {
		t.Errorf("spent=%v estimate=%v, want 430 and 620", spent, estimate)
	}
}

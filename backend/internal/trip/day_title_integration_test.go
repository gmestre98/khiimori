//go:build integration

package trip

import (
	"context"
	"errors"
	"testing"
)

// TestSetDayTitleRoundTrip sets, reads back, overwrites and clears a day's
// title against the migrated trip.days table, and checks the title survives a
// range edit that keeps the day.
func TestSetDayTitleRoundTrip(t *testing.T) {
	store := freshStore(t, sqlOwnerMemberships{}, pgxDayRegenerator{guard: noDayData{}})
	ctx := context.Background()
	nt := newTestTrip(t) // 2026-07-01 → 2026-07-10
	trip, err := store.Create(ctx, nt)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	day, err := store.GetDay(ctx, trip.ID, "2026-07-03")
	if err != nil {
		t.Fatalf("GetDay: %v", err)
	}
	if day.Title != "" {
		t.Fatalf("new day title = %q, want empty", day.Title)
	}

	set, err := store.SetDayTitle(ctx, trip.ID, "2026-07-03", "Sintra palaces")
	if err != nil {
		t.Fatalf("SetDayTitle: %v", err)
	}
	if set.Title != "Sintra palaces" || set.ID != day.ID || set.Index != 2 {
		t.Fatalf("SetDayTitle returned %+v", set)
	}
	got, _ := store.GetDay(ctx, trip.ID, "2026-07-03")
	if got.Title != "Sintra palaces" {
		t.Fatalf("read back title = %q", got.Title)
	}
	// Other days are untouched.
	other, _ := store.GetDay(ctx, trip.ID, "2026-07-04")
	if other.Title != "" {
		t.Fatalf("neighbouring day title = %q, want empty", other.Title)
	}

	// Extending the trip keeps the existing day and its title.
	if _, err := store.Update(ctx, trip.ID, nt.OwnerID, EditTrip{
		Name: nt.Name, Destinations: nt.Destinations, StartDate: nt.StartDate,
		EndDate: nt.EndDate.AddDate(0, 0, 2),
	}); err != nil {
		t.Fatalf("Update (extend): %v", err)
	}
	got, _ = store.GetDay(ctx, trip.ID, "2026-07-03")
	if got.Title != "Sintra palaces" {
		t.Fatalf("title after extend = %q", got.Title)
	}

	if _, err := store.SetDayTitle(ctx, trip.ID, "2026-07-03", ""); err != nil {
		t.Fatalf("clear title: %v", err)
	}
	got, _ = store.GetDay(ctx, trip.ID, "2026-07-03")
	if got.Title != "" {
		t.Fatalf("cleared title = %q", got.Title)
	}

	if _, err := store.SetDayTitle(ctx, trip.ID, "2030-01-01", "x"); !errors.Is(err, errDayNotFound) {
		t.Fatalf("missing day: err = %v, want errDayNotFound", err)
	}
}

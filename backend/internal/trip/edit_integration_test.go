//go:build integration

// Integration tests for trip edit (M03.1 S3). They run the real pgxTripStore
// Update against a migrated schema, proving: an edit updates the editable fields
// (and leaves EUR/owner untouched), the operation is owner-scoped (another user's
// trip is an indistinguishable not-found), and a date-range change surfaces to
// the day-generation seam exactly when (and only when) the range actually
// changes. Same gating and harness as create_integration_test.go.
package trip

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

// recordingDayRegenerator records each RegenerateDays call so a test can assert
// whether — and with what range — the day-generation seam fired.
type recordingDayRegenerator struct {
	calls int
	start time.Time
	end   time.Time
}

func (r *recordingDayRegenerator) RegenerateDays(_ context.Context, _ pgx.Tx, _ string, start, end time.Time) error {
	r.calls++
	r.start, r.end = start, end
	return nil
}

// seedTrip creates a trip via the store and returns it, failing the test on error.
func seedTrip(t *testing.T, store *pgxTripStore, nt NewTrip) Trip {
	t.Helper()
	got, err := store.Create(context.Background(), nt)
	if err != nil {
		t.Fatalf("seeding trip: %v", err)
	}
	return got
}

// TestUpdateEditsFieldsAndKeepsCurrencyAndOwner asserts an edit applies the new
// values, bumps updated_at, and never changes base_currency or owner_id.
func TestUpdateEditsFieldsAndKeepsCurrencyAndOwner(t *testing.T) {
	days := &recordingDayRegenerator{}
	store := freshStore(t, sqlOwnerMemberships{}, days)
	created := seedTrip(t, store, newTestTrip(t))
	days.calls = 0 // ignore the create-time generation; this test is about the edit
	ctx := context.Background()

	edit := EditTrip{
		Name:         "Lisbon (revised)",
		Destinations: []string{"Sintra"},
		StartDate:    mustDate(t, "2026-07-01"), // dates unchanged
		EndDate:      mustDate(t, "2026-07-10"),
		Cover:        "https://example.com/new.jpg",
	}
	updated, err := store.Update(ctx, created.ID, created.OwnerID, edit)
	if err != nil {
		t.Fatalf("Update: %v", err)
	}

	if updated.Name != "Lisbon (revised)" {
		t.Errorf("name = %q, want edited", updated.Name)
	}
	if len(updated.Destinations) != 1 || updated.Destinations[0] != "Sintra" {
		t.Errorf("destinations = %v, want [Sintra]", updated.Destinations)
	}
	if updated.Cover != "https://example.com/new.jpg" {
		t.Errorf("cover = %q, want edited", updated.Cover)
	}
	if updated.BaseCurrency != "EUR" {
		t.Errorf("base_currency = %q, want EUR (immutable)", updated.BaseCurrency)
	}
	if updated.OwnerID != created.OwnerID {
		t.Errorf("owner_id = %q, want unchanged %q", updated.OwnerID, created.OwnerID)
	}
	if !updated.UpdatedAt.After(created.UpdatedAt) {
		t.Errorf("updated_at = %v, want after %v", updated.UpdatedAt, created.UpdatedAt)
	}
	// Dates were unchanged, so the day-generation seam must not have fired.
	if days.calls != 0 {
		t.Errorf("RegenerateDays calls = %d, want 0 (dates unchanged)", days.calls)
	}
}

// TestUpdateDateChangeTriggersDayRegeneration asserts a date-range change fires
// the day-generation seam with the new range, and an edit that leaves the dates
// alone does not.
func TestUpdateDateChangeTriggersDayRegeneration(t *testing.T) {
	days := &recordingDayRegenerator{}
	store := freshStore(t, sqlOwnerMemberships{}, days)
	created := seedTrip(t, store, newTestTrip(t))
	days.calls = 0 // ignore the create-time generation; this test is about the edit
	ctx := context.Background()

	newEnd := mustDate(t, "2026-07-20")
	edit := EditTrip{
		Name:         created.Name,
		Destinations: created.Destinations,
		StartDate:    created.StartDate,
		EndDate:      newEnd, // extend the range
		Cover:        created.Cover,
	}
	if _, err := store.Update(ctx, created.ID, created.OwnerID, edit); err != nil {
		t.Fatalf("Update: %v", err)
	}

	if days.calls != 1 {
		t.Fatalf("RegenerateDays calls = %d, want 1 (range changed)", days.calls)
	}
	if !days.end.Equal(newEnd) {
		t.Errorf("RegenerateDays end = %v, want %v (the new range)", days.end, newEnd)
	}
}

// TestUpdateIsOwnerScoped asserts editing a trip owned by another user yields
// not-found and leaves the row untouched — no cross-owner edit.
func TestUpdateIsOwnerScoped(t *testing.T) {
	store := freshStore(t, sqlOwnerMemberships{}, &recordingDayRegenerator{})
	created := seedTrip(t, store, newTestTrip(t))
	ctx := context.Background()

	var otherOwner string
	if err := testPool.QueryRow(ctx, `SELECT gen_random_uuid()::text`).Scan(&otherOwner); err != nil {
		t.Fatalf("generating other owner id: %v", err)
	}

	edit := EditTrip{
		Name:         "Hijacked",
		Destinations: []string{},
		StartDate:    created.StartDate,
		EndDate:      created.EndDate,
		Cover:        "",
	}
	_, err := store.Update(ctx, created.ID, otherOwner, edit)
	if !errors.Is(err, errTripNotFound) {
		t.Fatalf("Update error = %v, want errTripNotFound", err)
	}

	// The row must be unchanged.
	var name string
	if err := testPool.QueryRow(ctx, `SELECT name FROM trip.trips WHERE id = $1::uuid`, created.ID).Scan(&name); err != nil {
		t.Fatalf("reading trip name: %v", err)
	}
	if name != created.Name {
		t.Errorf("name = %q, want unchanged %q (cross-owner edit must not apply)", name, created.Name)
	}
}

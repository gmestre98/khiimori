//go:build integration

// Integration tests for trip archive and delete (M03.1 S4). They run the real
// pgxTripStore against a migrated trip/sharing schema, proving:
//   - Archive sets status to "archived" and retains the row.
//   - Unarchive restores status to "active".
//   - Archive and unarchive are owner-scoped (another user's trip is a 404).
//   - Delete removes the trip and its memberships in one transaction; failure
//     leaves no orphans.
//   - Delete is owner-scoped.
//
// Same DB gating and harness as create/edit integration tests.
package trip

import (
	"context"
	"errors"
	"testing"
)

// TestArchiveSetsStatusAndRetainsRow asserts Archive sets the trip's status to
// "archived" and keeps the row in storage.
func TestArchiveSetsStatusAndRetainsRow(t *testing.T) {
	store := freshStore(t, sqlOwnerMemberships{}, pgxDayRegenerator{})
	created := seedTrip(t, store, newTestTrip(t))
	ctx := context.Background()

	archived, err := store.Archive(ctx, created.ID, created.OwnerID)
	if err != nil {
		t.Fatalf("Archive: %v", err)
	}
	if archived.Status != "archived" {
		t.Errorf("status = %q, want archived", archived.Status)
	}
	if archived.ID != created.ID {
		t.Errorf("id = %q, want %q (row must be retained)", archived.ID, created.ID)
	}

	// Confirm the row is still in the database (not deleted).
	var count int
	if err := testPool.QueryRow(ctx, `SELECT count(*) FROM trip.trips WHERE id = $1::uuid`, created.ID).Scan(&count); err != nil {
		t.Fatalf("counting trip rows: %v", err)
	}
	if count != 1 {
		t.Errorf("trip rows = %d, want 1 (archive must retain the row)", count)
	}
}

// TestUnarchiveRestoresActiveStatus asserts Unarchive reverses an archive and
// sets status back to "active".
func TestUnarchiveRestoresActiveStatus(t *testing.T) {
	store := freshStore(t, sqlOwnerMemberships{}, pgxDayRegenerator{})
	created := seedTrip(t, store, newTestTrip(t))
	ctx := context.Background()

	if _, err := store.Archive(ctx, created.ID, created.OwnerID); err != nil {
		t.Fatalf("Archive: %v", err)
	}
	restored, err := store.Unarchive(ctx, created.ID, created.OwnerID)
	if err != nil {
		t.Fatalf("Unarchive: %v", err)
	}
	if restored.Status != statusActive {
		t.Errorf("status = %q, want active after unarchive", restored.Status)
	}
}

// TestArchiveIsOwnerScoped asserts Archive on another user's trip returns
// errTripNotFound and leaves the row untouched.
func TestArchiveIsOwnerScoped(t *testing.T) {
	store := freshStore(t, sqlOwnerMemberships{}, pgxDayRegenerator{})
	created := seedTrip(t, store, newTestTrip(t))
	ctx := context.Background()

	var otherOwner string
	if err := testPool.QueryRow(ctx, `SELECT gen_random_uuid()::text`).Scan(&otherOwner); err != nil {
		t.Fatalf("generating other owner id: %v", err)
	}
	_, err := store.Archive(ctx, created.ID, otherOwner)
	if !errors.Is(err, errTripNotFound) {
		t.Fatalf("Archive error = %v, want errTripNotFound (cross-owner must be 404)", err)
	}

	var status string
	if err := testPool.QueryRow(ctx, `SELECT status FROM trip.trips WHERE id = $1::uuid`, created.ID).Scan(&status); err != nil {
		t.Fatalf("reading status: %v", err)
	}
	if status != statusActive {
		t.Errorf("status = %q, want active (cross-owner archive must not apply)", status)
	}
}

// TestDeleteRemovesTripAndMembershipsTransactionally asserts Delete removes the
// trip row and all its sharing memberships in one shot, leaving no orphans.
func TestDeleteRemovesTripAndMembershipsTransactionally(t *testing.T) {
	store := freshStore(t, sqlOwnerMemberships{}, pgxDayRegenerator{})
	created := seedTrip(t, store, newTestTrip(t))
	ctx := context.Background()

	if err := store.Delete(ctx, created.ID, created.OwnerID); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	var trips int
	if err := testPool.QueryRow(ctx, `SELECT count(*) FROM trip.trips WHERE id = $1::uuid`, created.ID).Scan(&trips); err != nil {
		t.Fatalf("counting trip rows: %v", err)
	}
	if trips != 0 {
		t.Errorf("trip rows after delete = %d, want 0", trips)
	}

	var memberships int
	if err := testPool.QueryRow(ctx, `SELECT count(*) FROM sharing.trip_memberships WHERE trip_id = $1::uuid`, created.ID).Scan(&memberships); err != nil {
		t.Fatalf("counting membership rows: %v", err)
	}
	if memberships != 0 {
		t.Errorf("membership rows after delete = %d, want 0 (cascade must clean up)", memberships)
	}
}

// TestDeleteIsOwnerScoped asserts Delete on another user's trip returns
// errTripNotFound and leaves the row and its memberships intact.
func TestDeleteIsOwnerScoped(t *testing.T) {
	store := freshStore(t, sqlOwnerMemberships{}, pgxDayRegenerator{})
	created := seedTrip(t, store, newTestTrip(t))
	ctx := context.Background()

	var otherOwner string
	if err := testPool.QueryRow(ctx, `SELECT gen_random_uuid()::text`).Scan(&otherOwner); err != nil {
		t.Fatalf("generating other owner id: %v", err)
	}
	if err := store.Delete(ctx, created.ID, otherOwner); !errors.Is(err, errTripNotFound) {
		t.Fatalf("Delete error = %v, want errTripNotFound (cross-owner must be 404)", err)
	}

	var count int
	if err := testPool.QueryRow(ctx, `SELECT count(*) FROM trip.trips WHERE id = $1::uuid`, created.ID).Scan(&count); err != nil {
		t.Fatalf("counting trip rows: %v", err)
	}
	if count != 1 {
		t.Errorf("trip rows = %d, want 1 (cross-owner delete must not remove the trip)", count)
	}
}

//go:build integration

// Integration tests for M08.4 S3 — invited-only trip visibility.
// They verify that the trip listing is scoped by sharing.trip_memberships:
//
//   - An invited user sees only trips they are a member of.
//   - A user with no memberships sees an empty listing.
//   - After membership is revoked, the trip disappears from the listing.
//
// Relies on the shared testPool and freshStore helpers defined in
// create_integration_test.go. Run with:
//
//	DATABASE_URL_TEST=<direct DSN> go test -tags=integration ./internal/trip/...
package trip

import (
	"context"
	"testing"
)

// addMembership inserts a non-owner membership directly so listing tests can
// simulate an invited user without going through the full invite flow.
func addMembership(t *testing.T, tripID, userID, role string) {
	t.Helper()
	_, err := testPool.Exec(context.Background(),
		`INSERT INTO sharing.trip_memberships (trip_id, user_id, role)
		 VALUES ($1::uuid, $2::uuid, $3::sharing.trip_role)`,
		tripID, userID, role)
	if err != nil {
		t.Fatalf("addMembership: %v", err)
	}
}

// removeMembership deletes a membership row to simulate revocation.
func removeMembership(t *testing.T, tripID, userID string) {
	t.Helper()
	_, err := testPool.Exec(context.Background(),
		`DELETE FROM sharing.trip_memberships WHERE trip_id = $1::uuid AND user_id = $2::uuid`,
		tripID, userID)
	if err != nil {
		t.Fatalf("removeMembership: %v", err)
	}
}

// genUserID returns a fresh random UUID to use as a user ID in tests.
func genUserID(t *testing.T) string {
	t.Helper()
	var id string
	if err := testPool.QueryRow(context.Background(), `SELECT gen_random_uuid()::text`).Scan(&id); err != nil {
		t.Fatalf("genUserID: %v", err)
	}
	return id
}

// TestInvitedUserSeesOnlySharedTrips asserts that a user who is added as a
// member of one trip (but not another) sees only the shared trip in their listing.
func TestInvitedUserSeesOnlySharedTrips(t *testing.T) {
	store := freshStore(t, sqlOwnerMemberships{}, pgxDayRegenerator{guard: noDayData{}})
	ctx := context.Background()

	owner := newTestTrip(t)
	sharedTrip, err := store.Create(ctx, owner)
	if err != nil {
		t.Fatalf("Create shared trip: %v", err)
	}

	owner2 := newTestTrip(t)
	_, err = store.Create(ctx, owner2)
	if err != nil {
		t.Fatalf("Create unshared trip: %v", err)
	}

	invitedUser := genUserID(t)
	addMembership(t, sharedTrip.ID, invitedUser, "viewer")

	trips, err := store.List(ctx, invitedUser)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(trips) != 1 {
		t.Fatalf("invited user listing: got %d trips, want 1", len(trips))
	}
	if trips[0].ID != sharedTrip.ID {
		t.Errorf("listed trip id = %q, want %q", trips[0].ID, sharedTrip.ID)
	}
}

// TestNonMemberSeesNoTrips asserts that a user with no memberships gets an
// empty listing — they cannot see others' trips.
func TestNonMemberSeesNoTrips(t *testing.T) {
	store := freshStore(t, sqlOwnerMemberships{}, pgxDayRegenerator{guard: noDayData{}})
	ctx := context.Background()

	owner := newTestTrip(t)
	if _, err := store.Create(ctx, owner); err != nil {
		t.Fatalf("Create trip: %v", err)
	}

	stranger := genUserID(t)
	trips, err := store.List(ctx, stranger)
	if err != nil {
		t.Fatalf("List for stranger: %v", err)
	}
	if len(trips) != 0 {
		t.Errorf("non-member listing: got %d trips, want 0", len(trips))
	}
}

// TestRevocationRemovesTripFromListing asserts that after a membership is
// revoked, the trip no longer appears in the user's listing.
func TestRevocationRemovesTripFromListing(t *testing.T) {
	store := freshStore(t, sqlOwnerMemberships{}, pgxDayRegenerator{guard: noDayData{}})
	ctx := context.Background()

	owner := newTestTrip(t)
	trip, err := store.Create(ctx, owner)
	if err != nil {
		t.Fatalf("Create trip: %v", err)
	}

	invitedUser := genUserID(t)
	addMembership(t, trip.ID, invitedUser, "editor")

	// Before revocation: trip is visible.
	trips, err := store.List(ctx, invitedUser)
	if err != nil {
		t.Fatalf("List before revoke: %v", err)
	}
	if len(trips) != 1 {
		t.Fatalf("before revoke: got %d trips, want 1", len(trips))
	}

	removeMembership(t, trip.ID, invitedUser)

	// After revocation: listing is empty.
	trips, err = store.List(ctx, invitedUser)
	if err != nil {
		t.Fatalf("List after revoke: %v", err)
	}
	if len(trips) != 0 {
		t.Errorf("after revoke: got %d trips, want 0", len(trips))
	}
}

// TestEditorSeesSharedTrip asserts that a user added with the 'editor' role
// sees the shared trip in their listing (role does not prevent visibility).
func TestEditorSeesSharedTrip(t *testing.T) {
	store := freshStore(t, sqlOwnerMemberships{}, pgxDayRegenerator{guard: noDayData{}})
	ctx := context.Background()

	owner := newTestTrip(t)
	trip, err := store.Create(ctx, owner)
	if err != nil {
		t.Fatalf("Create trip: %v", err)
	}

	editor := genUserID(t)
	addMembership(t, trip.ID, editor, "editor")

	trips, err := store.List(ctx, editor)
	if err != nil {
		t.Fatalf("List for editor: %v", err)
	}
	if len(trips) != 1 || trips[0].ID != trip.ID {
		t.Errorf("editor listing: got %v, want [%s]", trips, trip.ID)
	}
}

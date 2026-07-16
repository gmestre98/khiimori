//go:build integration

// Integration tests for the M08.3 invitation lifecycle: invite → accept →
// membership, role change, and revoke (pending and accepted).
//
// Run with:
//
//	DATABASE_URL_TEST=<direct DSN of a throwaway DB> \
//	    go test -tags=integration ./internal/sharing/...
package sharing

import (
	"context"
	"testing"
)

// freshInvitations skips when no test DB is configured, truncates the
// invitations table, and returns an Invitations instance.
func freshInvitations(t *testing.T) *Invitations {
	t.Helper()
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping invitation integration test")
	}
	_, err := testPool.Exec(context.Background(),
		`TRUNCATE sharing.invitations RESTART IDENTITY`)
	if err != nil {
		t.Fatalf("truncating invitations table: %v", err)
	}
	return NewInvitations(testPool)
}

// freshBoth returns freshly-truncated Memberships and Invitations for tests
// that need both tables clean.
func freshBoth(t *testing.T) (*Memberships, *Invitations) {
	t.Helper()
	if testPool == nil {
		t.Skip("DATABASE_URL_TEST not set; skipping invitation integration test")
	}
	_, err := testPool.Exec(context.Background(),
		`TRUNCATE sharing.invitations, sharing.trip_memberships RESTART IDENTITY`)
	if err != nil {
		t.Fatalf("truncating tables: %v", err)
	}
	return NewMemberships(testPool), NewInvitations(testPool)
}

// TestCreateAndRetrieveInvitation verifies that Create inserts a row and
// ByToken retrieves it.
func TestCreateAndRetrieveInvitation(t *testing.T) {
	inv := freshInvitations(t)
	ctx := context.Background()
	tripID := genUUID(t)
	token := genUUID(t)

	created, err := inv.Create(ctx, tripID, "friend@example.com", token, RoleEditor)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if created.Status != StatusSent {
		t.Errorf("created invitation status = %q, want %q", created.Status, StatusSent)
	}
	if created.Token != token {
		t.Errorf("token mismatch")
	}

	got, err := inv.ByToken(ctx, token)
	if err != nil {
		t.Fatalf("ByToken: %v", err)
	}
	if got.Email != "friend@example.com" {
		t.Errorf("email = %q, want friend@example.com", got.Email)
	}
	if got.Role != RoleEditor {
		t.Errorf("role = %q, want %q", got.Role, RoleEditor)
	}
}

// TestAcceptInvitation_HappyPath verifies that AcceptInTx atomically marks the
// invitation accepted and creates a TripMembership.
func TestAcceptInvitation_HappyPath(t *testing.T) {
	mb, inv := freshBoth(t)
	ctx := context.Background()
	tripID := genUUID(t)
	userID := genUUID(t)
	token := genUUID(t)

	if _, err := inv.Create(ctx, tripID, "invitee@example.com", token, RoleViewer); err != nil {
		t.Fatalf("Create invitation: %v", err)
	}

	tx, err := testPool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin tx: %v", err)
	}
	accepted, err := inv.AcceptInTx(ctx, tx, token, userID, "invitee@example.com")
	if err != nil {
		_ = tx.Rollback(ctx)
		t.Fatalf("AcceptInTx: %v", err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatalf("commit: %v", err)
	}

	if accepted.Status != StatusAccepted {
		t.Errorf("invitation status after accept = %q, want %q", accepted.Status, StatusAccepted)
	}

	// Verify the membership was created.
	role, err := mb.RoleForUser(ctx, tripID, userID)
	if err != nil {
		t.Fatalf("RoleForUser: %v", err)
	}
	if role != RoleViewer {
		t.Errorf("membership role = %q, want %q", role, RoleViewer)
	}
}

// TestAcceptInvitation_EmailMismatch verifies that accepting with a different
// email returns ErrEmailMismatch and does not create a membership.
func TestAcceptInvitation_EmailMismatch(t *testing.T) {
	mb, inv := freshBoth(t)
	ctx := context.Background()
	tripID := genUUID(t)
	userID := genUUID(t)
	token := genUUID(t)

	if _, err := inv.Create(ctx, tripID, "alice@example.com", token, RoleEditor); err != nil {
		t.Fatalf("Create: %v", err)
	}

	tx, err := testPool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin tx: %v", err)
	}
	_, err = inv.AcceptInTx(ctx, tx, token, userID, "bob@example.com")
	_ = tx.Rollback(ctx)

	if err == nil {
		t.Fatal("expected ErrEmailMismatch, got nil")
	}
	if err != ErrEmailMismatch {
		t.Errorf("want ErrEmailMismatch, got %v", err)
	}

	// No membership should have been created.
	_, roleErr := mb.RoleForUser(ctx, tripID, userID)
	if roleErr == nil {
		t.Error("membership should not exist after email mismatch")
	}
}

// TestAcceptInvitation_AlreadyAccepted verifies that re-accepting returns
// ErrInvitationAlreadyClaimed.
func TestAcceptInvitation_AlreadyAccepted(t *testing.T) {
	_, inv := freshBoth(t)
	ctx := context.Background()
	tripID := genUUID(t)
	userID := genUUID(t)
	token := genUUID(t)

	if _, err := inv.Create(ctx, tripID, "invitee@example.com", token, RoleEditor); err != nil {
		t.Fatalf("Create: %v", err)
	}

	// First accept.
	tx1, _ := testPool.Begin(ctx)
	if _, err := inv.AcceptInTx(ctx, tx1, token, userID, "invitee@example.com"); err != nil {
		_ = tx1.Rollback(ctx)
		t.Fatalf("first AcceptInTx: %v", err)
	}
	_ = tx1.Commit(ctx)

	// Second accept should fail.
	tx2, _ := testPool.Begin(ctx)
	_, err := inv.AcceptInTx(ctx, tx2, token, genUUID(t), "invitee@example.com")
	_ = tx2.Rollback(ctx)

	if err != ErrInvitationAlreadyClaimed {
		t.Errorf("want ErrInvitationAlreadyClaimed, got %v", err)
	}
}

// TestRevokeInvitation_Pending verifies that a pending invitation can be revoked.
func TestRevokeInvitation_Pending(t *testing.T) {
	inv := freshInvitations(t)
	ctx := context.Background()
	tripID := genUUID(t)
	token := genUUID(t)

	created, err := inv.Create(ctx, tripID, "friend@example.com", token, RoleViewer)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if err := inv.RevokeInvitation(ctx, created.ID); err != nil {
		t.Fatalf("RevokeInvitation: %v", err)
	}

	// Verify: trying to accept a revoked invitation returns AlreadyClaimed.
	tx, _ := testPool.Begin(ctx)
	_, acceptErr := inv.AcceptInTx(ctx, tx, token, genUUID(t), "friend@example.com")
	_ = tx.Rollback(ctx)
	if acceptErr != ErrInvitationAlreadyClaimed {
		t.Errorf("want ErrInvitationAlreadyClaimed for revoked invite, got %v", acceptErr)
	}
}

// TestRevokeInvitation_NotFound verifies ErrInvitationNotFound for a bogus ID.
func TestRevokeInvitation_NotFound(t *testing.T) {
	inv := freshInvitations(t)
	ctx := context.Background()

	err := inv.RevokeInvitation(ctx, genUUID(t))
	if err != ErrInvitationNotFound {
		t.Errorf("want ErrInvitationNotFound, got %v", err)
	}
}

// TestDeclineInvitation_Pending verifies a recipient can decline a pending
// invitation: it becomes unclaimable and drops out of PendingForEmail.
func TestDeclineInvitation_Pending(t *testing.T) {
	inv := freshInvitations(t)
	ctx := context.Background()
	tripID := genUUID(t)
	token := genUUID(t)

	created, err := inv.Create(ctx, tripID, "friend@example.com", token, RoleViewer)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if err := inv.DeclineByID(ctx, created.ID, "friend@example.com"); err != nil {
		t.Fatalf("DeclineByID: %v", err)
	}

	// A declined invitation can no longer be accepted.
	tx, _ := testPool.Begin(ctx)
	_, acceptErr := inv.AcceptInTx(ctx, tx, token, genUUID(t), "friend@example.com")
	_ = tx.Rollback(ctx)
	if acceptErr != ErrInvitationAlreadyClaimed {
		t.Errorf("want ErrInvitationAlreadyClaimed for declined invite, got %v", acceptErr)
	}

	// And it no longer surfaces in the recipient's inbox.
	pending, err := inv.PendingForEmail(ctx, "friend@example.com")
	if err != nil {
		t.Fatalf("PendingForEmail: %v", err)
	}
	for _, p := range pending {
		if p.ID == created.ID {
			t.Error("declined invitation should not appear in PendingForEmail")
		}
	}
}

// TestDeclineInvitation_EmailMismatch verifies a caller cannot decline an
// invitation addressed to someone else, and the invite stays pending.
func TestDeclineInvitation_EmailMismatch(t *testing.T) {
	inv := freshInvitations(t)
	ctx := context.Background()
	tripID := genUUID(t)
	token := genUUID(t)

	created, err := inv.Create(ctx, tripID, "alice@example.com", token, RoleViewer)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if err := inv.DeclineByID(ctx, created.ID, "bob@example.com"); err != ErrEmailMismatch {
		t.Errorf("want ErrEmailMismatch, got %v", err)
	}

	// The invitation is still claimable by the real recipient.
	tx, _ := testPool.Begin(ctx)
	_, acceptErr := inv.AcceptInTx(ctx, tx, token, genUUID(t), "alice@example.com")
	if acceptErr != nil {
		_ = tx.Rollback(ctx)
		t.Fatalf("accept after failed decline: %v", acceptErr)
	}
	_ = tx.Commit(ctx)
}

// TestDeclineInvitation_NotFound verifies ErrInvitationNotFound for a bogus ID.
func TestDeclineInvitation_NotFound(t *testing.T) {
	inv := freshInvitations(t)
	ctx := context.Background()

	if err := inv.DeclineByID(ctx, genUUID(t), "friend@example.com"); err != ErrInvitationNotFound {
		t.Errorf("want ErrInvitationNotFound, got %v", err)
	}
}

// TestChangeRole_ImmediateEffect verifies that ChangeRole takes effect
// immediately on the next RoleForUser call.
func TestChangeRole_ImmediateEffect(t *testing.T) {
	mb, _ := freshBoth(t)
	ctx := context.Background()
	tripID := genUUID(t)
	userID := genUUID(t)

	if err := mb.Add(ctx, tripID, userID, RoleEditor); err != nil {
		t.Fatalf("Add: %v", err)
	}

	if err := mb.ChangeRole(ctx, tripID, userID, RoleViewer); err != nil {
		t.Fatalf("ChangeRole: %v", err)
	}

	role, err := mb.RoleForUser(ctx, tripID, userID)
	if err != nil {
		t.Fatalf("RoleForUser: %v", err)
	}
	if role != RoleViewer {
		t.Errorf("role after change = %q, want %q", role, RoleViewer)
	}
}

// TestRevokeAccess_ImmediateEffect verifies that Revoke removes membership
// so the next RoleForUser call returns ErrMembershipNotFound.
func TestRevokeAccess_ImmediateEffect(t *testing.T) {
	mb, _ := freshBoth(t)
	ctx := context.Background()
	tripID := genUUID(t)
	userID := genUUID(t)

	if err := mb.Add(ctx, tripID, userID, RoleViewer); err != nil {
		t.Fatalf("Add: %v", err)
	}

	if err := mb.Revoke(ctx, tripID, userID); err != nil {
		t.Fatalf("Revoke: %v", err)
	}

	_, err := mb.RoleForUser(ctx, tripID, userID)
	if err != ErrMembershipNotFound {
		t.Errorf("want ErrMembershipNotFound after revoke, got %v", err)
	}
}

// TestForTrip_ListsAllInvitations verifies ForTrip returns all invitations for
// a trip, including sent and revoked ones.
func TestForTrip_ListsAllInvitations(t *testing.T) {
	inv := freshInvitations(t)
	ctx := context.Background()
	tripID := genUUID(t)

	tok1, tok2 := genUUID(t), genUUID(t)
	i1, err := inv.Create(ctx, tripID, "a@example.com", tok1, RoleEditor)
	if err != nil {
		t.Fatalf("Create i1: %v", err)
	}
	if _, err := inv.Create(ctx, tripID, "b@example.com", tok2, RoleViewer); err != nil {
		t.Fatalf("Create i2: %v", err)
	}
	// Revoke i1.
	if err := inv.RevokeInvitation(ctx, i1.ID); err != nil {
		t.Fatalf("RevokeInvitation i1: %v", err)
	}

	all, err := inv.ForTrip(ctx, tripID)
	if err != nil {
		t.Fatalf("ForTrip: %v", err)
	}
	if len(all) != 2 {
		t.Fatalf("ForTrip count = %d, want 2", len(all))
	}

	statusByEmail := map[string]InvitationStatus{}
	for _, i := range all {
		statusByEmail[i.Email] = i.Status
	}
	if statusByEmail["a@example.com"] != StatusRevoked {
		t.Errorf("a@example.com status = %q, want %q", statusByEmail["a@example.com"], StatusRevoked)
	}
	if statusByEmail["b@example.com"] != StatusSent {
		t.Errorf("b@example.com status = %q, want %q", statusByEmail["b@example.com"], StatusSent)
	}
}

// TestOnlyOwnerCanChangeRole verifies that the authorizer correctly distinguishes
// between owner (manage=true) and non-owner (manage=false).
func TestOnlyOwnerCanChangeRole(t *testing.T) {
	mb, _ := freshBoth(t)
	ctx := context.Background()
	tripID := genUUID(t)
	ownerID := genUUID(t)
	editorID := genUUID(t)

	if err := mb.Add(ctx, tripID, ownerID, RoleOwner); err != nil {
		t.Fatalf("Add owner: %v", err)
	}
	if err := mb.Add(ctx, tripID, editorID, RoleEditor); err != nil {
		t.Fatalf("Add editor: %v", err)
	}

	authz := NewMembershipAuthorizer(testPool)

	// Owner can manage.
	ok, err := authz.Can(ctx, ownerID, "manage", tripID)
	if err != nil {
		t.Fatalf("Can owner manage: %v", err)
	}
	if !ok {
		t.Error("owner should be able to manage")
	}

	// Editor cannot manage.
	ok, err = authz.Can(ctx, editorID, "manage", tripID)
	if err != nil {
		t.Fatalf("Can editor manage: %v", err)
	}
	if ok {
		t.Error("editor should not be able to manage")
	}
}

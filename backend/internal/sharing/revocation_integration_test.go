//go:build integration

// Integration tests for S3 — 403/404 enforcement and immediate revocation.
// These tests verify that:
//   - A revoked member is denied on the very next request (no stale window).
//   - A role downgrade (Editor → Viewer) takes effect immediately — subsequent
//     write attempts are denied.
//
// The MembershipAuthorizer reads membership state per-request from the DB with
// no local cache, so both properties hold by construction. These tests confirm
// that property against the real schema.
package sharing

import (
	"context"
	"testing"
)

// freshAuthorizer returns a MembershipAuthorizer backed by testPool, with a
// clean membership table.
func freshAuthorizer(t *testing.T) (*MembershipAuthorizer, *Memberships) {
	t.Helper()
	mb := freshMemberships(t)
	return NewMembershipAuthorizer(testPool), mb
}

// TestRevokeThenDenied asserts that after a membership is revoked, Can returns
// (false, nil) on the very next call — there is no stale-cache window.
func TestRevokeThenDenied(t *testing.T) {
	authz, mb := freshAuthorizer(t)
	ctx := context.Background()

	tripID := genUUID(t)
	userID := genUUID(t)

	if err := mb.Add(ctx, tripID, userID, RoleEditor); err != nil {
		t.Fatalf("Add: %v", err)
	}

	// Before revocation: editor can read and write.
	for _, action := range []string{"read", "write"} {
		ok, err := authz.Can(ctx, userID, action, tripID)
		if err != nil {
			t.Fatalf("before revoke, action=%s: %v", action, err)
		}
		if !ok {
			t.Errorf("before revoke, action=%s: editor should be allowed", action)
		}
	}

	if err := mb.Revoke(ctx, tripID, userID); err != nil {
		t.Fatalf("Revoke: %v", err)
	}

	// After revocation: all actions denied immediately on the next request.
	for _, action := range []string{"read", "write", "manage"} {
		ok, err := authz.Can(ctx, userID, action, tripID)
		if err != nil {
			t.Fatalf("after revoke, action=%s: %v", action, err)
		}
		if ok {
			t.Errorf("after revoke, action=%s: revoked member should be denied", action)
		}
	}
}

// TestDowngradeThenReadOnly asserts that after an Editor is downgraded to
// Viewer, write actions are denied on the very next request.
func TestDowngradeThenReadOnly(t *testing.T) {
	authz, mb := freshAuthorizer(t)
	ctx := context.Background()

	tripID := genUUID(t)
	userID := genUUID(t)

	if err := mb.Add(ctx, tripID, userID, RoleEditor); err != nil {
		t.Fatalf("Add: %v", err)
	}

	// Before downgrade: editor can write.
	ok, err := authz.Can(ctx, userID, "write", tripID)
	if err != nil {
		t.Fatalf("before downgrade: %v", err)
	}
	if !ok {
		t.Error("before downgrade: editor should be allowed to write")
	}

	if err := mb.ChangeRole(ctx, tripID, userID, RoleViewer); err != nil {
		t.Fatalf("ChangeRole: %v", err)
	}

	// After downgrade: write denied immediately.
	ok, err = authz.Can(ctx, userID, "write", tripID)
	if err != nil {
		t.Fatalf("after downgrade, write: %v", err)
	}
	if ok {
		t.Error("after downgrade to Viewer: write should be denied")
	}

	// Read still allowed.
	ok, err = authz.Can(ctx, userID, "read", tripID)
	if err != nil {
		t.Fatalf("after downgrade, read: %v", err)
	}
	if !ok {
		t.Error("after downgrade to Viewer: read should still be allowed")
	}
}

// TestNonMemberDeniedAllActions asserts that a user with no membership is denied
// for every action, confirming the 404/403 path in calling code.
func TestNonMemberDeniedAllActions(t *testing.T) {
	authz, _ := freshAuthorizer(t)
	ctx := context.Background()

	tripID := genUUID(t)
	userID := genUUID(t)
	// No membership added — user is a stranger to this trip.

	for _, action := range []string{"read", "write", "manage"} {
		ok, err := authz.Can(ctx, userID, action, tripID)
		if err != nil {
			t.Fatalf("non-member, action=%s: unexpected error: %v", action, err)
		}
		if ok {
			t.Errorf("non-member, action=%s: should be denied", action)
		}
	}
}

package trip

import (
	"context"
	"errors"
	"testing"
)

// fakeOwnershipReader lets tests control isOwner without a database.
type fakeOwnershipReader struct {
	ownerID string // the single user that is considered the owner
	err     error  // if non-nil, isOwner returns this error
}

func (f *fakeOwnershipReader) isOwner(_ context.Context, userID, _ string) (bool, error) {
	if f.err != nil {
		return false, f.err
	}
	return userID == f.ownerID, nil
}

func newShim(ownerID string) *OwnerOnlyAuthorizer {
	return &OwnerOnlyAuthorizer{reader: &fakeOwnershipReader{ownerID: ownerID}}
}

func newShimErr(err error) *OwnerOnlyAuthorizer {
	return &OwnerOnlyAuthorizer{reader: &fakeOwnershipReader{err: err}}
}

// TestOwnerOnlyAuthorizer_OwnerAllowed asserts the owner is allowed for every action.
func TestOwnerOnlyAuthorizer_OwnerAllowed(t *testing.T) {
	t.Parallel()

	shim := newShim("owner-1")
	ctx := context.Background()

	for _, action := range []Action{ActionRead, ActionWrite, ActionManage} {
		ok, err := shim.Can(ctx, "owner-1", action, "trip-abc")
		if err != nil {
			t.Fatalf("action %s: unexpected error: %v", action, err)
		}
		if !ok {
			t.Errorf("action %s: owner should be allowed, got denied", action)
		}
	}
}

// TestOwnerOnlyAuthorizer_NonOwnerDenied asserts non-owners are denied for every action.
func TestOwnerOnlyAuthorizer_NonOwnerDenied(t *testing.T) {
	t.Parallel()

	shim := newShim("owner-1")
	ctx := context.Background()

	for _, action := range []Action{ActionRead, ActionWrite, ActionManage} {
		ok, err := shim.Can(ctx, "other-user", action, "trip-abc")
		if err != nil {
			t.Fatalf("action %s: unexpected error: %v", action, err)
		}
		if ok {
			t.Errorf("action %s: non-owner should be denied, got allowed", action)
		}
	}
}

// TestOwnerOnlyAuthorizer_InfraError asserts reader errors propagate as (false, err).
func TestOwnerOnlyAuthorizer_InfraError(t *testing.T) {
	t.Parallel()

	sentinel := errors.New("db is down")
	shim := newShimErr(sentinel)
	ctx := context.Background()

	ok, err := shim.Can(ctx, "any-user", ActionRead, "trip-abc")
	if !errors.Is(err, sentinel) {
		t.Errorf("expected sentinel error, got: %v", err)
	}
	if ok {
		t.Error("expected false on infrastructure error, got true")
	}
}

// TestOwnerOnlyAuthorizer_DenyByDefault asserts that a user with no membership
// is denied even when the trip exists.
func TestOwnerOnlyAuthorizer_DenyByDefault(t *testing.T) {
	t.Parallel()

	// No ownerID set — every user gets false.
	shim := &OwnerOnlyAuthorizer{reader: &fakeOwnershipReader{ownerID: ""}}
	ctx := context.Background()

	ok, err := shim.Can(ctx, "any-user", ActionWrite, "trip-xyz")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ok {
		t.Error("expected deny-by-default, got allowed")
	}
}

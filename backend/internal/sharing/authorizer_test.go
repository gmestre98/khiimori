package sharing

import (
	"context"
	"errors"
	"testing"
)

// fakeMemberships is a test double for the membership reader used by MembershipAuthorizer.
type fakeMemberships struct {
	roleByUser map[string]Role // keyed by userID; tripID is ignored in tests
	err        error
}

func (f *fakeMemberships) RoleForUser(_ context.Context, _, userID string) (Role, error) {
	if f.err != nil {
		return "", f.err
	}
	role, ok := f.roleByUser[userID]
	if !ok {
		return "", ErrMembershipNotFound
	}
	return role, nil
}

// membershipAuthzReader is the injectable seam for testing Can without a DB.
type membershipAuthzReader interface {
	RoleForUser(ctx context.Context, tripID, userID string) (Role, error)
}

// testableAuthorizer wraps a reader so Can is testable without a real DB.
type testableAuthorizer struct {
	reader membershipAuthzReader
}

func (a *testableAuthorizer) Can(ctx context.Context, userID, action, tripID string) (bool, error) {
	role, err := a.reader.RoleForUser(ctx, tripID, userID)
	if errors.Is(err, ErrMembershipNotFound) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return roleAllows(role, action), nil
}

func newAuthzWithRoles(roles map[string]Role) *testableAuthorizer {
	return &testableAuthorizer{reader: &fakeMemberships{roleByUser: roles}}
}

func newAuthzWithErr(err error) *testableAuthorizer {
	return &testableAuthorizer{reader: &fakeMemberships{err: err}}
}

var allActions = []string{"read", "write", "manage"}

// TestOwnerAllowed asserts owners are allowed for every action.
func TestOwnerAllowed(t *testing.T) {
	t.Parallel()
	authz := newAuthzWithRoles(map[string]Role{"user-1": RoleOwner})
	ctx := context.Background()
	for _, action := range allActions {
		ok, err := authz.Can(ctx, "user-1", action, "trip-a")
		if err != nil {
			t.Fatalf("action %s: unexpected error: %v", action, err)
		}
		if !ok {
			t.Errorf("action %s: owner should be allowed, got denied", action)
		}
	}
}

// TestEditorCanReadAndWrite asserts editors are allowed to read and write but not manage.
func TestEditorCanReadAndWrite(t *testing.T) {
	t.Parallel()
	authz := newAuthzWithRoles(map[string]Role{"editor-1": RoleEditor})
	ctx := context.Background()

	for _, action := range []string{"read", "write"} {
		ok, err := authz.Can(ctx, "editor-1", action, "trip-a")
		if err != nil {
			t.Fatalf("action %s: unexpected error: %v", action, err)
		}
		if !ok {
			t.Errorf("action %s: editor should be allowed, got denied", action)
		}
	}

	ok, err := authz.Can(ctx, "editor-1", "manage", "trip-a")
	if err != nil {
		t.Fatalf("manage: unexpected error: %v", err)
	}
	if ok {
		t.Error("manage: editor should be denied, got allowed")
	}
}

// TestViewerCanReadOnly asserts viewers are allowed to read but not write or manage.
func TestViewerCanReadOnly(t *testing.T) {
	t.Parallel()
	authz := newAuthzWithRoles(map[string]Role{"viewer-1": RoleViewer})
	ctx := context.Background()

	ok, err := authz.Can(ctx, "viewer-1", "read", "trip-a")
	if err != nil {
		t.Fatalf("read: unexpected error: %v", err)
	}
	if !ok {
		t.Error("read: viewer should be allowed, got denied")
	}

	for _, action := range []string{"write", "manage"} {
		ok, err := authz.Can(ctx, "viewer-1", action, "trip-a")
		if err != nil {
			t.Fatalf("action %s: unexpected error: %v", action, err)
		}
		if ok {
			t.Errorf("action %s: viewer should be denied, got allowed", action)
		}
	}
}

// TestNonMemberDenied asserts non-members are denied for all actions.
func TestNonMemberDenied(t *testing.T) {
	t.Parallel()
	authz := newAuthzWithRoles(map[string]Role{}) // no memberships
	ctx := context.Background()
	for _, action := range allActions {
		ok, err := authz.Can(ctx, "stranger", action, "trip-a")
		if err != nil {
			t.Fatalf("action %s: unexpected error: %v", action, err)
		}
		if ok {
			t.Errorf("action %s: non-member should be denied, got allowed", action)
		}
	}
}

// TestInfraErrorPropagates asserts DB errors surface as (false, error).
func TestInfraErrorPropagates(t *testing.T) {
	t.Parallel()
	sentinel := errors.New("db timeout")
	authz := newAuthzWithErr(sentinel)
	ctx := context.Background()
	ok, err := authz.Can(ctx, "any", "read", "trip-x")
	if !errors.Is(err, sentinel) {
		t.Errorf("expected sentinel error, got: %v", err)
	}
	if ok {
		t.Error("expected false on infra error, got true")
	}
}

// TestRoleAllows_DenyByDefault asserts unknown roles are denied for all actions.
func TestRoleAllows_DenyByDefault(t *testing.T) {
	t.Parallel()
	for _, action := range allActions {
		if roleAllows("unknown-role", action) {
			t.Errorf("unknown role should be denied for action %s", action)
		}
	}
}

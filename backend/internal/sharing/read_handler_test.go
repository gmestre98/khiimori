package sharing

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
)

// TestHandleListMemberships_Unauthenticated verifies no principal → 401.
func TestHandleListMemberships_Unauthenticated(t *testing.T) {
	t.Parallel()
	m := &Module{authz: &fakeAuthz{}}
	req := httptest.NewRequest(http.MethodGet, "/trips/trip-1/memberships", nil)
	req.SetPathValue("tripID", "trip-1")

	rr := httptest.NewRecorder()
	m.handleListMemberships(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("want 401, got %d", rr.Code)
	}
}

// TestHandleListMemberships_MissingTripID verifies missing tripID → 400.
func TestHandleListMemberships_MissingTripID(t *testing.T) {
	t.Parallel()
	m := &Module{authz: &fakeAuthz{}}
	req := httptest.NewRequest(http.MethodGet, "/trips//memberships", nil)
	ctx := authn.WithPrincipal(req.Context(), authn.Principal{UserID: "u1"})
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	m.handleListMemberships(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", rr.Code)
	}
}

// TestHandleListMemberships_NotMember verifies non-member → 403.
func TestHandleListMemberships_NotMember(t *testing.T) {
	t.Parallel()
	m := &Module{authz: &fakeAuthz{allowed: map[string]bool{}}}
	req := httptest.NewRequest(http.MethodGet, "/trips/trip-1/memberships", nil)
	req.SetPathValue("tripID", "trip-1")
	ctx := authn.WithPrincipal(req.Context(), authn.Principal{UserID: "outsider"})
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	m.handleListMemberships(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("want 403, got %d", rr.Code)
	}
}

// TestHandleListInvitations_Unauthenticated verifies no principal → 401.
func TestHandleListInvitations_Unauthenticated(t *testing.T) {
	t.Parallel()
	m := &Module{authz: &fakeAuthz{}}
	req := httptest.NewRequest(http.MethodGet, "/trips/trip-1/invitations", nil)
	req.SetPathValue("tripID", "trip-1")

	rr := httptest.NewRecorder()
	m.handleListInvitations(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("want 401, got %d", rr.Code)
	}
}

// TestHandleListInvitations_MissingTripID verifies missing tripID → 400.
func TestHandleListInvitations_MissingTripID(t *testing.T) {
	t.Parallel()
	m := &Module{authz: &fakeAuthz{}}
	req := httptest.NewRequest(http.MethodGet, "/trips//invitations", nil)
	ctx := authn.WithPrincipal(req.Context(), authn.Principal{UserID: "u1"})
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	m.handleListInvitations(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", rr.Code)
	}
}

// TestHandleListInvitations_NotOwner verifies a non-owner (editor) → 403.
func TestHandleListInvitations_NotOwner(t *testing.T) {
	t.Parallel()
	// editor has "read" but not "manage"
	authz := &fakeAuthz{allowed: map[string]bool{"editor:read:trip-1": true}}
	m := &Module{authz: authz}

	req := httptest.NewRequest(http.MethodGet, "/trips/trip-1/invitations", nil)
	req.SetPathValue("tripID", "trip-1")
	ctx := authn.WithPrincipal(req.Context(), authn.Principal{UserID: "editor"})
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	m.handleListInvitations(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("want 403, got %d", rr.Code)
	}
}

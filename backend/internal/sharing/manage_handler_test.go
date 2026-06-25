package sharing

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
)

// TestHandleChangeRole_Forbidden verifies a non-owner gets 403.
func TestHandleChangeRole_Forbidden(t *testing.T) {
	t.Parallel()
	authz := &fakeAuthz{allowed: map[string]bool{}} // deny all
	m := &Module{authz: authz, memberships: &Memberships{}}

	req := httptest.NewRequest(http.MethodPatch, "/trips/trip-1/memberships/user-2",
		bytes.NewBufferString(`{"role":"viewer"}`))
	req.SetPathValue("tripID", "trip-1")
	req.SetPathValue("userID", "user-2")
	ctx := authn.WithPrincipal(req.Context(), authn.Principal{UserID: "user-1"})
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	m.handleChangeRole(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("want 403, got %d", rr.Code)
	}
}

// TestHandleChangeRole_InvalidRole verifies that an invalid role → 400.
func TestHandleChangeRole_InvalidRole(t *testing.T) {
	t.Parallel()
	authz := &fakeAuthz{allowed: map[string]bool{"owner:manage:trip-1": true}}
	m := &Module{authz: authz, memberships: &Memberships{}}

	req := httptest.NewRequest(http.MethodPatch, "/trips/trip-1/memberships/user-2",
		bytes.NewBufferString(`{"role":"owner"}`))
	req.SetPathValue("tripID", "trip-1")
	req.SetPathValue("userID", "user-2")
	ctx := authn.WithPrincipal(req.Context(), authn.Principal{UserID: "owner"})
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	m.handleChangeRole(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", rr.Code)
	}
}

// TestHandleRevokeMembership_Forbidden verifies a non-owner gets 403.
func TestHandleRevokeMembership_Forbidden(t *testing.T) {
	t.Parallel()
	authz := &fakeAuthz{allowed: map[string]bool{}} // deny all
	m := &Module{authz: authz, memberships: &Memberships{}}

	req := httptest.NewRequest(http.MethodDelete, "/trips/trip-1/memberships/user-2", nil)
	req.SetPathValue("tripID", "trip-1")
	req.SetPathValue("userID", "user-2")
	ctx := authn.WithPrincipal(req.Context(), authn.Principal{UserID: "user-1"})
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	m.handleRevokeMembership(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("want 403, got %d", rr.Code)
	}
}

// TestHandleRevokeInvitation_Forbidden verifies a non-owner gets 403.
func TestHandleRevokeInvitation_Forbidden(t *testing.T) {
	t.Parallel()
	authz := &fakeAuthz{allowed: map[string]bool{}} // deny all
	m := &Module{authz: authz, invitations: &Invitations{}}

	req := httptest.NewRequest(http.MethodDelete, "/trips/trip-1/invitations/inv-1", nil)
	req.SetPathValue("tripID", "trip-1")
	req.SetPathValue("invitationID", "inv-1")
	ctx := authn.WithPrincipal(req.Context(), authn.Principal{UserID: "user-1"})
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	m.handleRevokeInvitation(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("want 403, got %d", rr.Code)
	}
}

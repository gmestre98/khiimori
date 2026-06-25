package sharing

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestAdminGrantAccess_InvalidRole verifies that an invalid role returns 400.
func TestAdminGrantAccess_InvalidRole(t *testing.T) {
	t.Parallel()
	m := &Module{memberships: &Memberships{}}

	req := httptest.NewRequest(http.MethodPost, AdminTripMembersPath,
		bytes.NewBufferString(`{"user_id":"u-1","role":"superuser"}`))
	req.SetPathValue("tripID", "trip-1")
	rr := httptest.NewRecorder()
	m.handleAdminGrantAccess(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("want 400 for invalid role, got %d", rr.Code)
	}
}

// TestAdminGrantAccess_MissingUserID verifies that an empty user_id returns 400.
func TestAdminGrantAccess_MissingUserID(t *testing.T) {
	t.Parallel()
	m := &Module{memberships: &Memberships{}}

	req := httptest.NewRequest(http.MethodPost, AdminTripMembersPath,
		bytes.NewBufferString(`{"user_id":"","role":"editor"}`))
	req.SetPathValue("tripID", "trip-1")
	rr := httptest.NewRecorder()
	m.handleAdminGrantAccess(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("want 400 for missing user_id, got %d", rr.Code)
	}
}

// TestAdminChangeRole_InvalidRole verifies that an invalid role returns 400.
func TestAdminChangeRole_InvalidRole(t *testing.T) {
	t.Parallel()
	m := &Module{memberships: &Memberships{}}

	req := httptest.NewRequest(http.MethodPatch, AdminTripMemberPath,
		bytes.NewBufferString(`{"role":"god"}`))
	req.SetPathValue("tripID", "trip-1")
	req.SetPathValue("userID", "u-1")
	rr := httptest.NewRecorder()
	m.handleAdminChangeRole(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("want 400 for invalid role, got %d", rr.Code)
	}
}

// TestAdminRevokeAccess_MissingUserID verifies that a missing userID path value returns 400.
func TestAdminRevokeAccess_MissingUserID(t *testing.T) {
	t.Parallel()
	m := &Module{memberships: &Memberships{}}

	req := httptest.NewRequest(http.MethodDelete, "/admin/trips/trip-1/members/", nil)
	req.SetPathValue("tripID", "trip-1")
	// userID path value intentionally not set → empty string
	rr := httptest.NewRecorder()
	m.handleAdminRevokeAccess(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("want 400 for missing userID, got %d", rr.Code)
	}
}

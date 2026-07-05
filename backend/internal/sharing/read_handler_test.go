package sharing

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
)

// fakeInvitationLister is a DB-free stand-in for the invitations read seam.
type fakeInvitationLister struct{ items []Invitation }

func (f *fakeInvitationLister) ForTrip(_ context.Context, _ string) ([]Invitation, error) {
	return f.items, nil
}

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

// listInvitationsAsOwner serves GET invitations for an owner and decodes the rows.
func listInvitationsAsOwner(t *testing.T, m *Module) []invitationListResponse {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/trips/trip-1/invitations", nil)
	req.SetPathValue("tripID", "trip-1")
	ctx := authn.WithPrincipal(req.Context(), authn.Principal{UserID: "owner"})
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()
	m.handleListInvitations(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("want 200, got %d", rr.Code)
	}
	var body struct {
		Invitations []invitationListResponse `json:"invitations"`
	}
	if err := json.NewDecoder(rr.Body).Decode(&body); err != nil {
		t.Fatalf("decoding body: %v", err)
	}
	return body.Invitations
}

// TestHandleListInvitations_ExposesTokenWhenEnabled: on an E2E-targeted
// environment (M10.2) the owner-only list surfaces the opaque accept token so the
// harness can drive invite→accept without an email inbox.
func TestHandleListInvitations_ExposesTokenWhenEnabled(t *testing.T) {
	t.Parallel()
	authz := &fakeAuthz{allowed: map[string]bool{"owner:manage:trip-1": true}}
	m := &Module{
		authz:              authz,
		invList:            &fakeInvitationLister{items: []Invitation{{ID: "i1", TripID: "trip-1", Email: "e@x.test", Role: RoleEditor, Status: StatusSent, Token: "tok-123"}}},
		exposeInviteTokens: true,
	}

	rows := listInvitationsAsOwner(t, m)
	if len(rows) != 1 {
		t.Fatalf("rows = %d, want 1", len(rows))
	}
	if rows[0].Token != "tok-123" {
		t.Errorf("token = %q, want the accept token exposed when enabled", rows[0].Token)
	}
}

// TestHandleListInvitations_OmitsTokenByDefault: production (exposeInviteTokens
// off) never leaks the accept token — it stays email-only and is omitted from JSON.
func TestHandleListInvitations_OmitsTokenByDefault(t *testing.T) {
	t.Parallel()
	authz := &fakeAuthz{allowed: map[string]bool{"owner:manage:trip-1": true}}
	m := &Module{
		authz:   authz,
		invList: &fakeInvitationLister{items: []Invitation{{ID: "i1", TripID: "trip-1", Email: "e@x.test", Role: RoleEditor, Status: StatusSent, Token: "tok-123"}}},
		// exposeInviteTokens defaults to false.
	}

	rows := listInvitationsAsOwner(t, m)
	if len(rows) != 1 {
		t.Fatalf("rows = %d, want 1", len(rows))
	}
	if rows[0].Token != "" {
		t.Errorf("token = %q, want empty (omitted) in production", rows[0].Token)
	}
}

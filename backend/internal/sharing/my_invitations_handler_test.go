package sharing

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gmestre98/khiimori/backend/internal/platform/authn"
)

// fakePendingLister is a stub pendingInvitationLister for handler unit tests.
type fakePendingLister struct {
	invs []PendingInvitation
	err  error
}

func (f *fakePendingLister) PendingForEmail(_ context.Context, _ string) ([]PendingInvitation, error) {
	return f.invs, f.err
}

// TestHandleListMyInvitations_Unauthenticated returns 401 with no session.
func TestHandleListMyInvitations_Unauthenticated(t *testing.T) {
	t.Parallel()
	m := &Module{userEmails: &fakeUserEmailReader{email: "x@x.com"}, pendingList: &fakePendingLister{}}

	req := httptest.NewRequest(http.MethodGet, "/invitations", nil)
	rr := httptest.NewRecorder()
	m.handleListMyInvitations(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("want 401, got %d", rr.Code)
	}
}

// TestHandleListMyInvitations_Success returns the pending invitations for the
// signed-in user's email as JSON.
func TestHandleListMyInvitations_Success(t *testing.T) {
	t.Parallel()
	m := &Module{
		userEmails: &fakeUserEmailReader{email: "friend@example.com"},
		pendingList: &fakePendingLister{invs: []PendingInvitation{
			{ID: "inv-1", TripID: "trip-1", TripName: "Japan 2026", Role: RoleViewer},
		}},
	}

	req := httptest.NewRequest(http.MethodGet, "/invitations", nil)
	req = req.WithContext(authn.WithPrincipal(req.Context(), authn.Principal{UserID: "user-1"}))
	rr := httptest.NewRecorder()
	m.handleListMyInvitations(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("want 200, got %d (body: %s)", rr.Code, rr.Body.String())
	}
	var body struct {
		Invitations []myInvitationResponse `json:"invitations"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body.Invitations) != 1 {
		t.Fatalf("want 1 invitation, got %d", len(body.Invitations))
	}
	got := body.Invitations[0]
	if got.ID != "inv-1" || got.TripName != "Japan 2026" || got.Role != "viewer" {
		t.Errorf("unexpected invitation: %+v", got)
	}
}

// TestHandleListMyInvitations_EmailError returns 500 when the user email can't
// be resolved.
func TestHandleListMyInvitations_EmailError(t *testing.T) {
	t.Parallel()
	m := &Module{
		userEmails:  &fakeUserEmailReader{err: errors.New("boom")},
		pendingList: &fakePendingLister{},
	}

	req := httptest.NewRequest(http.MethodGet, "/invitations", nil)
	req = req.WithContext(authn.WithPrincipal(req.Context(), authn.Principal{UserID: "user-1"}))
	rr := httptest.NewRecorder()
	m.handleListMyInvitations(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("want 500, got %d", rr.Code)
	}
}

// TestHandleAcceptMyInvitation_Unauthenticated returns 401 with no session.
func TestHandleAcceptMyInvitation_Unauthenticated(t *testing.T) {
	t.Parallel()
	m := &Module{userEmails: &fakeUserEmailReader{email: "x@x.com"}}

	req := httptest.NewRequest(http.MethodPost, "/invitations/inv-1/accept", nil)
	req.SetPathValue("invitationID", "inv-1")
	rr := httptest.NewRecorder()
	m.handleAcceptMyInvitation(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("want 401, got %d", rr.Code)
	}
}

// TestHandleAcceptMyInvitation_MissingID returns 400 when no invitationID is set.
func TestHandleAcceptMyInvitation_MissingID(t *testing.T) {
	t.Parallel()
	m := &Module{userEmails: &fakeUserEmailReader{email: "x@x.com"}}

	req := httptest.NewRequest(http.MethodPost, "/invitations//accept", nil)
	req = req.WithContext(authn.WithPrincipal(req.Context(), authn.Principal{UserID: "user-1"}))
	rr := httptest.NewRecorder()
	m.handleAcceptMyInvitation(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("want 400, got %d", rr.Code)
	}
}

// TestHandleAcceptMyInvitation_EmailError returns 500 when the user email can't
// be resolved (before any DB work).
func TestHandleAcceptMyInvitation_EmailError(t *testing.T) {
	t.Parallel()
	m := &Module{userEmails: &fakeUserEmailReader{err: errors.New("boom")}}

	req := httptest.NewRequest(http.MethodPost, "/invitations/inv-1/accept", nil)
	req.SetPathValue("invitationID", "inv-1")
	req = req.WithContext(authn.WithPrincipal(req.Context(), authn.Principal{UserID: "user-1"}))
	rr := httptest.NewRecorder()
	m.handleAcceptMyInvitation(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("want 500, got %d", rr.Code)
	}
}
